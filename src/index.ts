import { config } from 'dotenv';
config();
import Librus from 'librus-api';
import { Annoucement } from './types/annoucement';
import { Message, MessageDetails } from './types/inbox';
import { sendWebhook } from './webhook';
import { colorAdded, colorChanged, colorRemoved } from './colors';
import logger from './logger';
import { CalendarEvent } from './types/calendar';

const client = new Librus();

let announcements: Annoucement[] = [];
let calendar: CalendarEvent[] = [];
let calendarMonth = new Date().getMonth();

const checkAnnouncements = async (): Promise<void> => {
    logger.debug('Checking annoucements');
    const newAnnoucements: Annoucement[] = await client.inbox.listAnnouncements();

    logger.debug(`Got ${newAnnoucements.length}/${announcements.length} annoucements`);
    
    if (JSON.stringify(announcements) !== JSON.stringify(newAnnoucements)) {
        logger.debug(`Annoucements differ`);
        const results = newAnnoucements.filter(({ content: c1 }) => !announcements.some(({ content: c2 }) => c2 === c1));
        logger.debug(JSON.stringify(results, null, 2));
        if (newAnnoucements.length > announcements.length) { // annoucement added
            results.forEach((annoucement) => {
                sendWebhook({
                    title: annoucement.title,
                    description: annoucement.content,
                    author: { name: annoucement.user, },
                    color: colorAdded,
                    footer: { text: 'Dodano ogłoszenie', }
                }).catch(err => logger.error(err));
            });
        } else if (newAnnoucements.length < announcements.length) { // annoucement removed
            results.forEach((annoucement) => {
                sendWebhook({
                    title: annoucement.title,
                    description: annoucement.content,
                    author: { name: annoucement.user, },
                    color: colorRemoved,
                    footer: { text: 'Usunięto ogłoszenie', }
                }).catch(err => logger.error(err));
            });
        } else if (results.length){ // annoucement changed
            results.forEach((annoucement) => {
                sendWebhook({
                    title: annoucement.title,
                    description: annoucement.content,
                    author: { name: annoucement.user, },
                    color: colorChanged,
                    footer: { text: 'Zmieniono ogłoszenie', }
                }).catch(err => logger.error(err));
            });
        }  else {
            logger.error(new Error('Could not get difference between old and new annoucements'));
        }

        announcements = newAnnoucements;
    }
}

const checkCalendar = async (): Promise<void> => {
    logger.debug('Checking calendar...');

    const newCalendar: CalendarEvent[] = (await client.calendar.getCalendar()).flat();

    if (calendarMonth != new Date().getMonth()) {
        logger.debug('Starting new month');
        calendar = newCalendar;
        calendarMonth = new Date().getMonth();
        return;
    }

    logger.debug(`Got ${newCalendar.length}/${calendar.length} calendar events`);

    if (JSON.stringify(newCalendar) !== JSON.stringify(calendar)) {
        logger.debug(`Events differ`);
        const results = newCalendar.filter(({ title: c1 }) => !calendar.some(({ title: c2 }) => c2 === c1));
        logger.debug(JSON.stringify(results, null, 2));

        if (newCalendar.length > calendar.length) { // event added
            results.forEach((event) => {
                sendWebhook({
                    title: event.title,
                    description: event.title,
                    color: colorAdded,
                    footer: { text: 'Dodano wydarzenie', },
                    timestamp: Date.parse(event.day),
                }).catch(err => logger.error(err));
            });
        } else if (newCalendar.length < calendar.length) { // event removed
            results.forEach((event) => {
                sendWebhook({
                    title: event.title,
                    description: event.title,
                    color: colorRemoved,
                    footer: { text: 'Usunięto wydarzenie', },
                    timestamp: Date.parse(event.day),
                }).catch(err => logger.error(err));
            });
        } else if (results.length) { // event changed
            results.forEach((event) => {
                sendWebhook({
                    title: event.title,
                    description: event.title,
                    color: colorChanged,
                    footer: { text: 'Zmieniono wydarzenie', },
                    timestamp: Date.parse(event.day),
                }).catch(err => logger.error(err));
            });
        } else {
            logger.error(new Error('Could not get difference between old and new annoucements'));
        }

        calendar = newCalendar;
    }
}

const checkInbox = async (): Promise<void> => {
    logger.debug('Checking inbox...');
    const messages: Message[] = await client.inbox.listInbox(5);
    
    messages.slice(0, 20).forEach((message: Message) => {
        if (!message.read) {
            logger.debug(`Found message id ${message.id}`);
            client.inbox.getMessage(5, message.id)
                .then((messageDetails: MessageDetails) => {
                    sendWebhook({
                        title: messageDetails.title,
                        description: messageDetails.content,
                        author: { name: messageDetails.user },
                        url: 'https://synergia.librus.pl/' + messageDetails.url,
                    }).catch((err: Error) => logger.error(err));
                })
                .catch((err: Error) => logger.error(err));
        }
    });
}

(async () => {
    logger.log({
        level: 'init',
        message: 'Logging in...',
        color: 'cyanBright',
    });

    await client.authorize(process.env.LIBRUS_LOGIN, process.env.LIBRUS_PASSWORD);
    const accountInfo = await client.info.getAccountInfo();

    if (accountInfo.student.index) {
        logger.log({
            level: 'init',
            message: 'Logged in!',
            color: 'greenBright',
        });

        logger.log({
            level: 'init',
            message: 'Pre-fetching annoucements.',
            color: 'gray',
        });

        announcements = await client.inbox.listAnnouncements();

        logger.log({
            level: 'init',
            message: 'Pre-fetching calendar.',
            color: 'gray',
        });

        calendar = (await client.calendar.getCalendar()).flat();

        logger.log({
            level: 'init',
            message: 'Initialization done.',
            color: 'cyanBright',
        });

        logger.log({
            level: 'info',
            message: 'Looking for changes...',
            color: 'magentaBright',
        });

        checkInbox().catch(err => logger.error(err));

        setInterval(() => {
            checkAnnouncements().catch(err => logger.error(err));
            checkCalendar().catch(err => logger.error(err));
            checkInbox().catch(err => logger.error(err));
        }, 10 * 60 * 1000); // every 10 mins
    } else {
        logger.error(new Error('Failed to login.'));
    }
})();