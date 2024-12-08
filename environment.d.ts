declare global {
    namespace NodeJS {
        interface ProcessEnv {
            WEBHOOK_URL: string;
            LIBRUS_LOGIN: string;
            LIBRUS_PASSWORD: string;
            DEBUG_MODE?: '1' | '0';
            ENV: 'prod' | 'dev';
        }
    }
}

export { };