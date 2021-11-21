const sqlite = require('better-sqlite3');
const logger = require('./logger');
const { printTimestamp, getNextUTCTimestamp } = require('./utils');

const DAY = 24 * 60 * 60 * 1000;
const timer = ms => new Promise(res => setTimeout(res, ms));

class Database {
    constructor() {
        this._db = new sqlite('db.sqlite');
        this._statsDb = new sqlite('stats.sqlite');

        this._videosInProgress = new Set();
        this._videosInDeletion = new Set();

        this._db.pragma('journal_mode=WAL');
        this._db.pragma('secure_delete=0');
        this._db.pragma('synchronous=NORMAL');
        this._db.pragma('cache_size=5000');
        this._db.pragma('journal_size_limit=10000000');

        this._db.prepare('CREATE TABLE IF NOT EXISTS videos(id TINYTEXT PRIMARY KEY, initialCommentCount INT,' +
            ' commentCount INT, retrievedAt BIGINT, lastUpdated BIGINT, inProgress BOOL, nextPageToken TEXT, rawObject TEXT)').run();
        this._db.prepare('CREATE TABLE IF NOT EXISTS comments(id TINYTEXT PRIMARY KEY, textDisplay TEXT, authorDisplayName TEXT,' +
            ' authorProfileImageUrl TINYTEXT, authorChannelId TINYTEXT, likeCount INT, publishedAt BIGINT, updatedAt BIGINT,' +
            ' totalReplyCount SMALLINT, videoId TINYTEXT, FOREIGN KEY(videoId) REFERENCES videos(id) ON DELETE CASCADE)').run();

        this._db.prepare('CREATE INDEX IF NOT EXISTS comment_index ON comments(videoId, publishedAt, likeCount)').run();

        this._statsDb.prepare('CREATE TABLE IF NOT EXISTS stats(id TINYTEXT, title TINYTEXT, duration INT,' +
            ' finishedAt BIGINT, commentCount INT, commentThreads INT)').run();

        this.scheduleCleanup();
    }

    checkVideo(videoId) {
        const actuallyInProgress = this._videosInProgress.has(videoId);
        const inDeletion = this._videosInDeletion.has(videoId);
        const row = this._db.prepare('SELECT * FROM videos WHERE id = ?').get(videoId);

        return { row, actuallyInProgress, inDeletion };
    }

    addVideo(video) {
        const now = Date.now();
        this._db.prepare('INSERT OR REPLACE INTO videos(id, initialCommentCount, retrievedAt, lastUpdated, rawObject, inProgress)' +
            ' VALUES(?, ?, ?, ?, ?, true)')
            .run(video.id, video.statistics.commentCount, now, now, JSON.stringify(video));
        this._videosInProgress.add(video.id);
    }

    reAddVideo(video) {
        this._db.prepare('UPDATE videos SET lastUpdated = ?, rawObject = ?, inProgress = true WHERE id = ?')
            .run(Date.now(), JSON.stringify(video), video.id);
        this._videosInProgress.add(video.id);
    }

    deleteVideo(videoId) {
        this._db.prepare('DELETE FROM videos WHERE id = ?').run(videoId);
    }

    async deleteVideoChunks(videoId, verbose = false) {
        verbose && logger.log('info', "Deleting video %s in chunks.", videoId);

        this._videosInDeletion.add(videoId);
        this._db.prepare('UPDATE videos SET inProgress = true, nextPageToken = ? WHERE id = ?').run(null, videoId);

        let deleteCount = 0;
        let changes = 1;
        while (changes > 0) {
            changes = this._db.prepare(`DELETE FROM comments WHERE videoId = ? LIMIT 2500`).run(videoId).changes;
            deleteCount += changes;
            await (timer(50));
        }
        this._db.prepare('DELETE FROM videos WHERE id = ?').run(videoId);
        this._videosInDeletion.delete(videoId);

        verbose && logger.log('info', "Finished deleting video %s in chunks; %s comments deleted.",
            videoId, deleteCount.toLocaleString());

        return deleteCount;
    }

    abortVideo(videoId) {
        this._videosInProgress.delete(videoId);
    }

    getLastComment(videoId) {
        return this._db.prepare('SELECT id, MAX(publishedAt) FROM comments WHERE videoId = ?').get(videoId);
    }

    getComments(videoId, limit, offset, sortBy, minDate, maxDate) {
        const rows = this._db.prepare(`SELECT * FROM comments WHERE videoId = ? AND publishedAt >= ? AND publishedAt <= ?
            ORDER BY ${sortBy} LIMIT ${Number(limit)} OFFSET ${Number(offset)}`).all(videoId, minDate, maxDate);

        const subCount = this._db.prepare(`SELECT COUNT(*) FROM comments WHERE videoId = ? AND publishedAt >= ? AND publishedAt <= ?`)
            .get(videoId, minDate, maxDate)['COUNT(*)'];

        const totalCount = this._db.prepare('SELECT COUNT(*) FROM comments WHERE videoId = ?').get(videoId)['COUNT(*)'];

        return { rows, subCount, totalCount };
    }

    getAllDates(videoId) {
        return this._db.prepare('SELECT publishedAt FROM comments WHERE videoId = ? ORDER BY publishedAt DESC')
            .all(videoId);
    }

    getStatistics(videoId) {
        const stats = {};

        const row = this._db.prepare('SELECT COUNT(*), sum(likeCount) FROM comments WHERE videoId = ?').get(videoId);
        stats.comments = Number(row['COUNT(*)']);
        stats.totalLikes = Number(row['sum(likeCount)']);

        return stats;
    }

    writeNewComments(videoId, comments, newCommentCount, nextPageToken) {
        const insert = [];
        for (let i = 0; i < comments.length; i++) { 
            insert.push(comments[i].id, comments[i].textDisplay, comments[i].authorDisplayName,
                comments[i].authorProfileImageUrl, comments[i].authorChannelId, comments[i].likeCount,
                comments[i].publishedAt, comments[i].updatedAt, comments[i].totalReplyCount, videoId);
        }
        const placeholders = comments.map(() => `(?,?,?,?,?,?,?,?,?,?)`).join(',');

        const statement = this._db.prepare(`INSERT OR REPLACE INTO comments(id, textDisplay, authorDisplayName, authorProfileImageUrl,` +
            ` authorChannelId, likeCount, publishedAt, updatedAt, totalReplyCount, videoId) VALUES ${placeholders}`);
        statement.run(insert);

        this._db.prepare('UPDATE videos SET commentCount = ?, lastUpdated = ?, nextPageToken = ? WHERE id = ?')
            .run(newCommentCount, Date.now(), nextPageToken || null, videoId);
    }

    markVideoComplete(videoId, videoTitle, elapsed, newComments, newCommentThreads) {
        this._db.prepare('UPDATE videos SET inProgress = false WHERE id = ?').run(videoId);
        this._videosInProgress.delete(videoId);

        this._statsDb.prepare('INSERT INTO stats(id, title, duration, finishedAt, commentCount, commentThreads) VALUES (?,?,?,?,?,?)')
            .run(videoId, videoTitle, elapsed, Date.now(), newComments, newCommentThreads);
    }

    scheduleCleanup() {
        // Clean up database every Wednesday & Saturday at 09:00 UTC
        const nextWednesday = getNextUTCTimestamp(3, 9);
        const nextSaturday = getNextUTCTimestamp(6, 9);

        // Take the earlier date
        const nextCleanup = new Date(Math.min(nextWednesday, nextSaturday));
        const timeToNextCleanup = nextCleanup.getTime() - Date.now();

        setTimeout(() => this.cleanup(), timeToNextCleanup);
        logger.log('info', "Next database cleanup scheduled for %s, in %d hours",
            printTimestamp(nextCleanup), (timeToNextCleanup / 1000 / 60 / 60).toFixed(3));
    }

    async cleanup() {
        // Remove any videos with:
        // - under 10,000 comments & > 2 days untouched
        // - under 100K comments   & > 5 days untouched
        // - under 1M comments     & > 7 days untouched
        // - under 10M comments    & > 21 days untouched

        logger.log('info', "CLEANUP: Starting database cleanup");

        await this.cleanUpSet(2 * DAY,  10000, true);
        await this.cleanUpSet(5 * DAY,  100000);
        await this.cleanUpSet(7 * DAY,  1000000);
        await this.cleanUpSet(21 * DAY, 10000000);

        logger.log('info', "CLEANUP: Finished database cleanup");
        this.scheduleCleanup();
    }

    async cleanUpSet(age, commentCount, includeInProgress = false) {
        const now = Date.now();
        const inProgressClause = includeInProgress ? `OR inProgress = true` : '';

        const rows = this._db.prepare(`SELECT id FROM videos WHERE (lastUpdated < ?) AND (commentCount < ? ${inProgressClause})`)
            .all(now - age, commentCount);

        let totalDeleteCount = 0;

        for (const row of rows) {
            totalDeleteCount += await this.deleteVideoChunks(row.id);
        }

        logger.log('info', "CLEANUP: Deleted rows with < %s comments: %s videos, %s comments",
            commentCount.toLocaleString(), rows.length, totalDeleteCount.toLocaleString());
    }
}

module.exports = Database;
