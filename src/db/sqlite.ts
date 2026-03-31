import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';

let db: Database | null = null;

export async function initDB() {
    if (db) return db;
    db = await open({
        filename: path.join(process.cwd(), 'data', 'history.db'),
        driver: sqlite3.Database
    });
    
    await db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId TEXT NOT NULL,
            roomId TEXT NOT NULL,
            pdfFileName TEXT,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(userId, roomId)
        );
    `);
    return db;
}

export async function logSession(userId: string, roomId: string, pdfFileName: string) {
    const db = await initDB();
    await db.run(
        `INSERT INTO sessions (userId, roomId, pdfFileName) VALUES (?, ?, ?)
         ON CONFLICT(userId, roomId) DO UPDATE SET 
         pdfFileName = excluded.pdfFileName,
         createdAt = CURRENT_TIMESTAMP`,
        [userId, roomId, pdfFileName]
    );
}

export async function getUserSessions(userId: string) {
    const db = await initDB();
    return await db.all(
        `SELECT roomId, pdfFileName, createdAt FROM sessions WHERE userId = ? ORDER BY createdAt DESC`,
        [userId]
    );
}
