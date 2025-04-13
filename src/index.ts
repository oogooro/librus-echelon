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
import { WebhookEmbedData } from './types/webhookEmbed';
import { Grade, SubjectGradesData } from './types/grades';

import { writeFileSync } from 'node:fs';

const client = new Librus();

let announcements: Announcement[] = [];
let calendar: CalendarEvent[] = [];
let calendarMonth = new Date().getMonth();
let luckyNumber: number;
let studentIndex: number;
let grades: Grade[] = [];

const differsBy = <T>(a: T[], b: T[]): { removed: T[], added: T[] } => {
    const aString = a.map((v) => JSON.stringify(v));
    const bString = b.map((v) => JSON.stringify(v));

    const removed = aString.filter((v) => !bString.includes(v)).map((v) => JSON.parse(v));
    const added = bString.filter((v) => !aString.includes(v)).map((v) => JSON.parse(v));
    return { removed, added };
};

const getGrades = async (): Promise<Grade[]> => {
    const subjectGrades = await client.info.getGrades() as SubjectGradesData[];
    const tempGrades: Grade[] = [];

    for (const subject of subjectGrades)
        for (const semester of subject.semester)
            for (const grade of semester.grades) tempGrades.push({
                ...grade,
                subject: subject.name,
                url: `https://synergia.librus.pl/przegladaj_oceny/szczegoly/${grade.id}`,
            });

    tempGrades.sort((a, b) => a.id - b.id);
    return tempGrades;
};

const checkAnnouncements = async (): Promise<void> => {
    logger.debug('Checking announcements');
    const newAnnouncements: Announcement[] = await client.inbox.listAnnouncements();

    logger.debug(`Got ${newAnnouncements.length}/${announcements.length} announcements`);

    if (JSON.stringify(announcements) !== JSON.stringify(newAnnouncements)) {
        const embeds: WebhookEmbedData[] = [];
        logger.debug(`Announcements differ`);

        const difference = differsBy<Announcement>(announcements, newAnnouncements);
        const { added, removed } = difference;

        logger.debug(JSON.stringify(difference, null, 2));

        removed.forEach(announcement => {
            embeds.push({
                title: announcement.title,
                description: announcement.content,
                author: { name: announcement.user, },
                color: colorRemoved,
                footer: { text: 'Usunięto ogłoszenie', },
            });
        });

        added.forEach(announcement => {
            embeds.push({
                title: announcement.title,
                description: announcement.content,
                author: { name: announcement.user, },
                color: colorAdded,
                footer: { text: 'Dodano ogłoszenie', },
            });
        });

        if (embeds.length) {
            const chunkedEmbeds = _.chunk(embeds, 10);
            for (const embedChunk of chunkedEmbeds) await sendWebhook(embedChunk).catch(err => logger.error(err));
        }

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
        const embeds: WebhookEmbedData[] = [];
        logger.debug(`Events differ`);

        const difference = differsBy<CalendarEvent>(calendar, newCalendar);
        const { added, removed } = difference;

        logger.debug(JSON.stringify(difference, null, 2));

        removed.forEach(event => {
            embeds.push({
                title: event.title,
                description: event.title,
                color: colorRemoved,
                footer: { text: 'Usunięto wydarzenie', },
                timestamp: Date.parse(event.day),
            });
        });

        added.forEach(event => {
            embeds.push({
                title: event.title,
                description: event.title,
                color: colorAdded,
                footer: { text: 'Dodano wydarzenie', },
                timestamp: Date.parse(event.day),
            });
        });

        if (embeds.length) {
            const chunkedEmbeds = _.chunk(embeds, 10);
            for (const embedChunk of chunkedEmbeds) await sendWebhook(embedChunk).catch(err => logger.error(err));
        }

        calendar = newCalendar;
    }
};

const checkInbox = async (): Promise<void> => {
    logger.debug('Checking inbox...');
    const messages: Message[] = await client.inbox.listInbox(5);

    const embeds: WebhookEmbedData[] = [];

    for (const message of messages.slice(0, 20)) {
        if (!message.read) {
            logger.debug(`Found message ${message.id}`);
            const unread: MessageDetails | void = await client.inbox.getMessage(5, message.id).catch(err => { logger.error(err); });

            if (!unread) return; // failed to fetch

            embeds.push({
                title: unread.title,
                description: unread.content,
                author: { name: unread.user, },
                url: `https://synergia.librus.pl/${unread.url}`,
            });
        }
    }

    if (embeds.length) {
        const chunkedEmbeds = _.chunk(embeds, 10);
        for (const embedChunk of chunkedEmbeds) await sendWebhook(embedChunk).catch(err => logger.error(err));
    }
};

const checkLuckyNumber = async (): Promise<boolean> => {
    logger.debug('Checking lucky number...');
    const newLuckyNumber = await client.info.getLuckyNumber();

    if (newLuckyNumber == 0) return false;

    if (newLuckyNumber !== luckyNumber) {
        luckyNumber = newLuckyNumber;

        sendWebhook({
            title: 'Szczęśliwy numer',
            description: `# Szczęśliwym numerem jest: **${luckyNumber}**${luckyNumber === studentIndex ? '\n## ***Gratulacje! jesteś szczęśliwy!***' : ''}`,
        }).catch((err: Error) => logger.error(err));
    }

    return true;
};

const checkGrades = async (): Promise<void> => {
    logger.debug('Checking grades');
    const newGrades = await getGrades();

    logger.debug(`Got ${newGrades.length}/${grades.length} grades`);

    if (JSON.stringify(grades) !== JSON.stringify(newGrades)) {
        logger.debug(`Grades differ`);
        
        const embeds: WebhookEmbedData[] = [];
        const difference = differsBy<Grade>(grades, newGrades);
        const { added, removed } = difference;
        
        logger.debug(JSON.stringify(difference, null, 2));
        
        added.forEach(grade => {
            embeds.push({
                title: `Dodano ocenę ${grade.value}`,
                description: grade.info,
                author: { name: grade.subject, },
                url: grade.url,
                color: colorAdded,
            });
        });

        removed.forEach(grade => {
            embeds.push({
                title: `Usunięto ocenę ${grade.value}`,
                description: grade.info,
                author: { name: grade.subject, },
                url: grade.url,
                color: colorRemoved,
            });
        });

        if (embeds.length) {
            const chunkedEmbeds = _.chunk(embeds, 10);
            for (const embedChunk of chunkedEmbeds) await sendWebhook(embedChunk).catch(err => logger.error(err));
        }

        grades = newGrades;
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
            message: 'Pre-fetching grades.',
            color: 'gray',
        });

        grades = await getGrades();

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
            checkLuckyNumber()
                .catch(err => logger.error(err))
                .then(dataValid => {
                    if (dataValid) {
                        checkAnnouncements().catch(err => logger.error(err));
                        checkCalendar().catch(err => logger.error(err));
                        checkInbox().catch(err => logger.error(err));
                        checkGrades().catch(err => logger.error(err));
                    } else {
                        logger.log({
                            level: 'info',
                            message: 'Librus is in maintenance mode',
                            color: 'gray'
                        });
                    }
                });
        }, 10 * 60 * 1000); // every 10 mins
    } else {
        logger.error(new Error('Failed to login.'));
    }
})().catch(err => logger.error(err));