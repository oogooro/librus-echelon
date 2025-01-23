import { config } from 'dotenv';
config();
import Librus from 'librus-api';
import { Announcement } from './types/announcement';
import { Message, MessageDetails } from './types/inbox';
import { sendWebhook } from './webhook';
import { colorAdded, colorRemoved } from './colors';
import logger from './logger';
import { CalendarEvent } from './types/calendar';
import _ from 'lodash';

const client = new Librus();

let announcements: Announcement[] = [];
let calendar: CalendarEvent[] = [];
let calendarMonth = new Date().getMonth();
let luckyNumber: number;
let studentIndex: number;

const findArrayDifferences = <T>(oldArray: T[], newArray: T[], property: keyof T): { removed: T[], added: T[] } => {
    const removed = oldArray.filter(oldItem => !newArray.some(newItem => newItem[property] === oldItem[property]));
    const added = newArray.filter(newItem => !oldArray.some(oldItem => oldItem[property] === newItem[property]));
    return { removed, added };
};

const checkAnnouncements = async (): Promise<void> => {
    logger.debug('Checking announcements');
    const newAnnouncements: Announcement[] = await client.inbox.listAnnouncements();

    logger.debug(`Got ${newAnnouncements.length}/${announcements.length} announcements`);
    
    if (JSON.stringify(announcements) !== JSON.stringify(newAnnouncements)) {
        logger.debug(`Announcements differ`);

        const difference = findArrayDifferences<Announcement>(announcements, newAnnouncements, 'content');
        const { added, removed } = difference;

        logger.debug(JSON.stringify(difference, null, 2));

        added.forEach(announcement => {
            sendWebhook({
                title: announcement.title,
                description: announcement.content,
                author: { name: announcement.user, },
                color: colorAdded,
                footer: { text: 'Dodano ogłoszenie', }
            }).catch(err => logger.error(err));
        });

        removed.forEach(announcement => {
            sendWebhook({
                title: announcement.title,
                description: announcement.content,
                author: { name: announcement.user, },
                color: colorRemoved,
                footer: { text: 'Usunięto ogłoszenie', }
            }).catch(err => logger.error(err));
        });

        announcements = newAnnouncements;
    }
};

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

        const difference = findArrayDifferences<CalendarEvent>(calendar, newCalendar, 'id');
        const { added, removed } = difference;

        logger.debug(JSON.stringify(difference, null, 2));

        added.forEach(event => {
            sendWebhook({
                title: event.title,
                description: event.title,
                color: colorAdded,
                footer: { text: 'Dodano wydarzenie', },
                timestamp: Date.parse(event.day),
            }).catch(err => logger.error(err));
        });

        removed.forEach(event => {
            sendWebhook({
                title: event.title,
                description: event.title,
                color: colorRemoved,
                footer: { text: 'Usunięto wydarzenie', },
                timestamp: Date.parse(event.day),
            }).catch(err => logger.error(err));
        });

        calendar = newCalendar;
    }
};

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
};

const checkLuckyNumber = async (): Promise<void> => {
    logger.debug('Checking lucky number...');
    const newLuckyNumber = await client.info.getLuckyNumber();
    if (newLuckyNumber !== luckyNumber) {
        luckyNumber = newLuckyNumber;

        sendWebhook({
            title: 'Szczęśliwy numer',
            description: `# Szczęśliwym numerem jest: **${luckyNumber}**${luckyNumber === studentIndex ? '\n## ***Gratulacje! jesteś szczęśliwy!***' : ''}`,
        }).catch((err: Error) => logger.error(err));
    }
};

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

        studentIndex = parseInt(accountInfo.student.index);

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
            message: 'Pre-fetching lucky number.',
            color: 'gray',
        });

        luckyNumber = await client.info.getLuckyNumber();

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
            checkLuckyNumber().catch(err => logger.error(err));
        }, 10 * 60 * 1000); // every 10 mins
    } else {
        logger.error(new Error('Failed to login.'));
    }
})();