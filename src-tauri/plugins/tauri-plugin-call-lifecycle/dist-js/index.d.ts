export interface ConnectRequest {
    connectionId: string;
    serverUrl: string;
    participantToken: string;
}
export interface DisconnectRequest {
    connectionId: string;
}
export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnecting';
export interface CallState {
    revision: number;
    state: ConnectionState;
    connectionId: string | null;
}
export interface CallLifecycleError {
    revision: number;
    code: string;
    message: string;
    connectionId: string | null;
}
export declare function connect(request: ConnectRequest): Promise<CallState>;
export declare function disconnect(request: DisconnectRequest): Promise<CallState>;
export declare function getState(): Promise<CallState>;
