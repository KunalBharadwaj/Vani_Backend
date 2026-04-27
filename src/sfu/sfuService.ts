import * as mediasoup from "mediasoup";
import type { types } from "mediasoup";
import { sfuConfig } from "./config.js";
import { broadcast } from "../rooms/roomManager.js";

let worker: types.Worker;

// Track state in-memory
export const routers = new Map<string, types.Router>();
export const transports = new Map<string, types.WebRtcTransport>();
export const producers = new Map<string, types.Producer>();
export const consumers = new Map<string, types.Consumer>();
// Reverse mapping: transport -> router
export const transportToRouter = new Map<string, types.Router>();
// Mapping to aggregate producers per room
export const roomProducers = new Map<string, types.Producer[]>();

export async function startMediasoup(): Promise<void> {
    worker = await mediasoup.createWorker({
        logLevel: sfuConfig.worker.logLevel as types.WorkerLogLevel,
        logTags: sfuConfig.worker.logTags,
        rtcMinPort: sfuConfig.worker.rtcMinPort,
        rtcMaxPort: sfuConfig.worker.rtcMaxPort,
    });

    worker.on("died", () => {
        console.error("Mediasoup worker died, exiting...");
        process.exit(1);
    });

    console.log("Mediasoup worker started successfully.");
}

export async function getOrCreateRouter(roomId: string): Promise<types.Router> {
    if (!routers.has(roomId)) {
        const router = await worker.createRouter({ mediaCodecs: sfuConfig.router.mediaCodecs });
        routers.set(roomId, router);
        console.log(`Created SFU Router for room: ${roomId}`);
    }
    return routers.get(roomId)!;
}

export async function createWebRtcTransport(roomId: string): Promise<types.WebRtcTransport> {
    const router = await getOrCreateRouter(roomId);

    const transport = await router.createWebRtcTransport({
        listenInfos: sfuConfig.webRtcTransport.listenInfos,
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
        initialAvailableOutgoingBitrate: sfuConfig.webRtcTransport.initialAvailableOutgoingBitrate,
    });

    transports.set(transport.id, transport);
    transportToRouter.set(transport.id, router);

    transport.on("dtlsstatechange", (state: types.DtlsState) => {
        if (state === "closed" || state === "failed") {
            transport.close();
        }
    });

    transport.on("routerclose", () => {
        transport.close();
    });

    return transport;
}

export async function connectTransport(transportId: string, dtlsParameters: types.DtlsParameters): Promise<void> {
    const transport = transports.get(transportId);
    if (!transport) throw new Error("Transport not found");
    await transport.connect({ dtlsParameters });
}

export async function loadProducer(roomId: string, transportId: string, kind: types.MediaKind, rtpParameters: types.RtpParameters, userId: string): Promise<types.Producer> {
    const transport = transports.get(transportId);
    if (!transport) throw new Error("Transport not found");

    const producer = await transport.produce({ kind, rtpParameters, appData: { userId } });
    producers.set(producer.id, producer);

    if (!roomProducers.has(roomId)) {
        roomProducers.set(roomId, []);
    }
    roomProducers.get(roomId)!.push(producer);

    producer.on("transportclose", () => {
        producer.close();
    });

    const removeProducer = () => {
        const roomArray = roomProducers.get(roomId);
        if (roomArray) {
            roomProducers.set(roomId, roomArray.filter((p) => p.id !== producer.id));
        }
    };

    producer.observer.on("close", () => {
        removeProducer();
        broadcast(roomId, { type: "webrtc:producerRemoved", producerId: producer.id });
    });

    return producer;
}

export async function loadConsumer(transportId: string, producerId: string, rtpCapabilities: types.RtpCapabilities): Promise<types.Consumer | null> {
    const transport = transports.get(transportId);
    if (!transport) throw new Error("Transport not found");

    const router = transportToRouter.get(transport.id); // Get router mapped to this transport
    if (!router) throw new Error("Router not found");

    if (!router.canConsume({ producerId, rtpCapabilities })) {
        console.warn(`Cannot consume producer ${producerId}`);
        return null;
    }

    const consumer = await transport.consume({
        producerId,
        rtpCapabilities,
        paused: true, // Start paused to wait for client confirmation
    });

    consumers.set(consumer.id, consumer);

    consumer.on("transportclose", () => {
        consumer.close();
    });

    consumer.on("producerclose", () => {
        consumer.close();
    });

    return consumer;
}

export async function resumeConsumer(consumerId: string): Promise<void> {
    const consumer = consumers.get(consumerId);
    if (consumer) await consumer.resume();
}

export async function closeProducer(producerId: string): Promise<void> {
    const producer = producers.get(producerId);
    if (producer) {
        producer.close();
        producers.delete(producerId);
    }
}
