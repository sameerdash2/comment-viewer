const sqlite = require('better-sqlite3');
const logger = require('./logger');
const { printTimestamp } = require('./utils');

const DAY = 24 * 60 * 60 * 1000;
const timer = ms => new Promise(res => setTimeout(res, ms));

class Database {
    constructor() {
        this._db = new sqlite('db.sqlite');
        this._statsDb = new sqlite('stats.sqlite');
        this._videosInProgress = new Set();

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

        this._db.prepare('CREATE VIRTUAL TABLE IF NOT EXISTS comments_fts USING fts5(content="comments", id UNINDEXED, textDisplay,' +
            ' authorDisplayName, authorProfileImageUrl UNINDEXED, authorChannelId UNINDEXED, likeCount UNINDEXED,' +
            ' publishedAt UNINDEXED, updatedAt UNINDEXED, totalReplyCount UNINDEXED, videoId UNINDEXED)').run();
        // Create triggers to keep virtual FTS table up to date with comments table
        this._db.exec(`
            CREATE TRIGGER IF NOT EXISTS comments_ai AFTER INSERT ON comments BEGIN
                INSERT INTO comments_fts(
                    id, textDisplay, authorDisplayName, authorProfileImageUrl, authorChannelId,
                    likeCount, publishedAt, updatedAt, totalReplyCount, videoId
                ) VALUES (
                    new.id, new.textDisplay, new.authorDisplayName, new.authorProfileImageUrl, new.authorChannelId,
                    new.likeCount, new.publishedAt, new.updatedAt, new.totalReplyCount, new.videoId
                );
            END;
            CREATE TRIGGER IF NOT EXISTS comments_ad AFTER DELETE ON comments BEGIN
                INSERT INTO comments_fts(
                    comments_fts, rowid, id, textDisplay, authorDisplayName, authorProfileImageUrl, authorChannelId,
                    likeCount, publishedAt, updatedAt, totalReplyCount, videoId
                ) VALUES (
                    'delete', old.rowid, old.id, old.textDisplay, old.authorDisplayName, old.authorProfileImageUrl, old.authorChannelId,
                    old.likeCount, old.publishedAt, old.updatedAt, old.totalReplyCount, old.videoId
                );
            END;
            CREATE TRIGGER IF NOT EXISTS comments_au AFTER UPDATE ON comments BEGIN
                INSERT INTO comments_fts(
                    comments_fts, rowid, id, textDisplay, authorDisplayName, authorProfileImageUrl, authorChannelId,
                    likeCount, publishedAt, updatedAt, totalReplyCount, videoId
                ) VALUES (
                    'delete', old.rowid, old.id, old.textDisplay, old.authorDisplayName, old.authorProfileImageUrl, old.authorChannelId,
                    old.likeCount, old.publishedAt, old.updatedAt, old.totalReplyCount, old.videoId
                );
                INSERT INTO comments_fts(
                    id, textDisplay, authorDisplayName, authorProfileImageUrl, authorChannelId,
                    likeCount, publishedAt, updatedAt, totalReplyCount, videoId
                ) VALUES (
                    new.id, new.textDisplay, new.authorDisplayName, new.authorProfileImageUrl, new.authorChannelId,
                    new.likeCount, new.publishedAt, new.updatedAt, new.totalReplyCount, new.videoId
                );
            END;
        `);

        this._db.prepare('CREATE INDEX IF NOT EXISTS comment_index ON comments(videoId, publishedAt, likeCount)').run();

        this._statsDb.prepare('CREATE TABLE IF NOT EXISTS stats(id TINYTEXT, title TINYTEXT, duration INT,' +
            ' finishedAt BIGINT, commentCount INT, commentThreads INT)').run();

        this.scheduleCleanup();
    }

    checkVideo(videoId) {
        const actuallyInProgress = this._videosInProgress.has(videoId);
        const row = this._db.prepare('SELECT * FROM videos WHERE id = ?').get(videoId);
        return { row, actuallyInProgress };
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

    abortVideo(videoId) {
        this._videosInProgress.delete(videoId);
    }

    getLastComment(videoId) {
        return this._db.prepare('SELECT id, MAX(publishedAt) FROM comments WHERE videoId = ?').get(videoId);
    }

    getComments(videoId, limit, offset, sortBy, minDate, maxDate, searchTerms) {
        let rows, subCount;
        const totalCount = this._db.prepare('SELECT COUNT(*) FROM comments WHERE videoId = ?').get(videoId)['COUNT(*)'];
        let subCountStatement, rowsStatement;

        if (searchTerms[0]) {
            searchTerms[0] = this.formatString(searchTerms[0]);

            subCountStatement = this._db.prepare(`SELECT COUNT(*) FROM comments_fts WHERE videoId = ? AND textDisplay MATCH ?
                    AND publishedAt >= ? AND publishedAt <= ?`)
                .bind(videoId, searchTerms[0], minDate, maxDate);

            rowsStatement = this._db.prepare(`SELECT * FROM comments_fts WHERE videoId = ? AND textDisplay MATCH ?
                    AND publishedAt >= ? AND publishedAt <= ? ORDER BY ${sortBy} LIMIT ${Number(limit)} OFFSET ${Number(offset)}`)
                .bind(videoId, searchTerms[0], minDate, maxDate);
        }
        else if (searchTerms[1]) {
            searchTerms[1] = this.formatString(searchTerms[1]);

            subCountStatement = this._db.prepare(`SELECT COUNT(*) FROM comments_fts WHERE videoId = ? AND authorDisplayName MATCH ?
                    AND publishedAt >= ? AND publishedAt <= ?`)
                .bind(videoId, searchTerms[1], minDate, maxDate);

            rowsStatement = this._db.prepare(`SELECT * FROM comments_fts WHERE videoId = ? AND authorDisplayName MATCH ?
                    AND publishedAt >= ? AND publishedAt <= ? ORDER BY ${sortBy} LIMIT ${Number(limit)} OFFSET ${Number(offset)}`)
                .bind(videoId, searchTerms[1], minDate, maxDate);
        }
        // No search
        else {
            subCountStatement = this._db.prepare(`SELECT COUNT(*) FROM comments WHERE videoId = ?
                    AND publishedAt >= ? AND publishedAt <= ?`)
                .bind(videoId, minDate, maxDate);

            rowsStatement = this._db.prepare(`SELECT * FROM comments WHERE videoId = ? AND publishedAt >= ? AND publishedAt <= ?
                    ORDER BY ${sortBy} LIMIT ${Number(limit)} OFFSET ${Number(offset)}`)
                .bind(videoId, minDate, maxDate);
        }

        try {
            subCount = subCountStatement.get()['COUNT(*)'];
            rows = rowsStatement.all();
            return { rows, subCount, totalCount, error: false };
        } catch (err) {
            if (err.message !== 'SQLITE_CORRUPT_VTAB') {
                logger.log('error', "Error getting comments for video %s with searchTerms %O: '%s', %s",
                    videoId, searchTerms, err.code, err.message);
            }
            return { rows: [], subCount: 0, totalCount: totalCount, error: true };
        }
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
            .run(videoId, videoTitle.substring(0, 50), elapsed, Date.now(), newComments, newCommentThreads);
    }

    scheduleCleanup() {
        // Clean up database every Saturday at 09:00 UTC
        const nextCleanup = new Date();
        const diff = 6 - nextCleanup.getUTCDay();
        nextCleanup.setUTCDate(nextCleanup.getUTCDate() + diff);
        nextCleanup.setUTCHours(9, 0, 0, 0);
        const now = Date.now();
        if (nextCleanup <= now) {
            nextCleanup.setUTCDate(nextCleanup.getUTCDate() + 7);
        }
        const timeToNextCleanup = nextCleanup - now;

        setTimeout(() => this.cleanup(), timeToNextCleanup);
        logger.log('info', "Next database cleanup scheduled for %s, in %d hours",
            printTimestamp(nextCleanup), (timeToNextCleanup / 1000 / 60 / 60).toFixed(3));
    }

    async cleanup() {
        // Remove any videos with:
        // - under 10,000 comments & > 2 days untouched
        // - under 1M comments     & > 7 days untouched
        // - under 10M comments    & > 30 days untouched

        logger.log('info', "Starting database cleanup");

        await this.cleanupSet(2 * DAY, 10000, true);
        await this.cleanupSet(7 * DAY, 1000000);
        await this.cleanupSet(30 * DAY, 10000000);

        logger.log('info', "Finished database cleanup");
        this.scheduleCleanup();
    }

    async cleanupSet(age, commentCount, includeInProgress = false) {
        const now = Date.now();
        const inProgressClause = includeInProgress ? `OR inProgress = true` : '';

        const rows = this._db.prepare(`SELECT id FROM videos WHERE (lastUpdated < ?) AND (commentCount < ? ${inProgressClause})`)
            .all(now - age, commentCount);
        const placeholders = rows.map(() => '?').join(',');
        const deleteCount = this._db.prepare(`SELECT COUNT(*) FROM comments WHERE videoId IN (${placeholders})`)
            .get(rows.map((row) => row.id))['COUNT(*)'];

        for (const row of rows) {
            this._db.prepare('DELETE FROM videos WHERE id = ?').run(row.id);
            await(timer(500));
        }

        logger.log('info', "Deleted rows with < %s comments: %s videos, %s comments",
            commentCount.toLocaleString(), rows.length, deleteCount.toLocaleString());
    }

    formatString(str) {
        // Ensure that any double quotes in search string are matched up (or tokenizer throws error).
        // If not, remove the last instance of double quote
        if ((str.split('"').length - 1) % 2 !== 0) {
            const pos = str.lastIndexOf('"');
            str = str.substring(0, pos) + str.substring(pos + 1);
        }
        // Enclose string in double quotes to force tokenizer to treat it as a single string
        return `"${str}"`;
    }
}

module.exports = Database;
