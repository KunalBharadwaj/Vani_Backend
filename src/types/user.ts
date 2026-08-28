// The authenticated user payload carried in the JWT and attached to sockets/requests.
export interface UserPayload {
  id: string;
  name?: string;
  email?: string;
  picture?: string;
}
