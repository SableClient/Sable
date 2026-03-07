interface Splashscreen {
    ping(value: string): Promise<string | null>;
    close(): Promise<void>;
}
declare const splashscreen: Splashscreen;
export default splashscreen;
