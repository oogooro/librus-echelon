import { APIEmbed, EmbedBuilder, JSONEncodable, WebhookClient } from 'discord.js'
import { WebhookEmbedData } from './types/webhookEmbed';
import logger from './logger';
import { colorDefault } from './colors';
import moment from 'moment';

export const webhook = new WebhookClient({
    url: process.env.WEBHOOK_URL,
});

export const sendWebhook = async (data: WebhookEmbedData | WebhookEmbedData[]): Promise<void> => {
    const embeds: (APIEmbed | JSONEncodable<APIEmbed>)[] = [];

    if (!Array.isArray(data)) data = [data];

    for (const embedData of data) {
        const embed = new EmbedBuilder()
            .setTitle(embedData.title)
            .setDescription(embedData.description)
            .setColor(embedData.color ?? colorDefault)
            .setURL(embedData.url);

        if (embedData.author?.name) embed.setAuthor(embedData.author);

        let footerText = embedData.footer?.text ?? '';

        if (embedData.timestamp) footerText += ` ∙ <t:${embedData.timestamp / 1000}:d> (${moment(embedData.timestamp).format('ddd')})`;

        embed.setFooter({iconURL: embedData.footer.iconURL, text: footerText,});
        embeds.push(embed);
    }

    logger.debug('Sending webhook...');
    await webhook.send({ embeds, });
}