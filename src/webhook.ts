import { EmbedBuilder, WebhookClient } from 'discord.js'
import { WebhookEmbedData } from './types/webhookEmbed';
import logger from './logger';

export const webhook = new WebhookClient({
    url: process.env.WEBHOOK_URL,
});

export const sendWebhook = async (data: WebhookEmbedData): Promise<void> => {
    const embed = new EmbedBuilder()
        .setTitle(data.title)
        .setDescription(data.description)
        .setColor(data.color ?? 'DarkVividPink')
        .setTimestamp(data.timestamp)
        .setURL(data.url)

    if (data.author?.name) embed.setAuthor(data.author);
    if (data.footer?.text) embed.setFooter(data.footer);

    logger.debug('Sending webhook...');
    await webhook.send({ embeds: [embed], });
}