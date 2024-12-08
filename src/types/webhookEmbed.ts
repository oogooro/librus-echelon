import { ColorResolvable, EmbedAuthorData, EmbedFooterData } from 'discord.js'

export type WebhookEmbedData = {
    title: string,
    description: string,
    color?: ColorResolvable,
    url?: string,
    author?: EmbedAuthorData,
    timestamp?: number,
    footer?: EmbedFooterData,
}