const sqlite = require('better-sqlite3');
const logger = require('./logger');

const DAY = 24*60*60*1000;

class Database {
    constructor() {
        this._db = new sqlite('database.sql');
        this._videosInProgress = new Set();

        this._db.prepare('CREATE TABLE IF NOT EXISTS videos(id TINYTEXT PRIMARY KEY, initialCommentCount INT,' +
            ' commentCount INT, retrievedAt BIGINT, lastUpdated BIGINT, inProgress BOOL, nextPageToken TEXT, rawObject TEXT)').run();
        this._db.prepare('CREATE TABLE IF NOT EXISTS comments(id TINYTEXT PRIMARY KEY, textDisplay TEXT, authorDisplayName TEXT,' +
            ' authorProfileImageUrl TINYTEXT, authorChannelId TINYTEXT, likeCount INT, publishedAt BIGINT, updatedAt BIGINT,' +
            ' totalReplyCount SMALLINT, videoId TINYTEXT, FOREIGN KEY(videoId) REFERENCES videos(id) ON DELETE CASCADE)').run();

        this._db.prepare('CREATE VIRTUAL TABLE IF NOT EXISTS comments_fts USING fts4(content="comments", id PRIMARY KEY, textDisplay, authorDisplayName,' +
                ' authorProfileImageUrl, authorChannelId, likeCount, publishedAt, updatedAt, totalReplyCount, videoId, tokenize=unicode61,' +
                ' notindexed=id, notindexed=authorProfileImageUrl, notindexed=authorChannelId, notindexed=likeCount, notindexed=publishedAt,' +
                ' notindexed=updatedAt, notindexed=totalReplyCount, notindexed=videoId)').run();
        // Create triggers to keep virtual FTS table up to date with comments table
        this._db.exec(`
            CREATE TRIGGER IF NOT EXISTS comments_bu BEFORE UPDATE ON comments BEGIN
                DELETE FROM comments_fts WHERE docid=old.id;
            END;
            CREATE TRIGGER IF NOT EXISTS comments_bd BEFORE DELETE ON comments BEGIN
                DELETE FROM comments_fts WHERE docid=old.id;
            END;
            CREATE TRIGGER IF NOT EXISTS comments_au AFTER UPDATE ON comments BEGIN
                INSERT INTO comments_fts(docid, id, textDisplay, authorDisplayName, authorProfileImageUrl, authorChannelId,
                    likeCount, publishedAt, updatedAt, totalReplyCount, videoId)
                VALUES(new.rowid, new.id, new.textDisplay, new.authorDisplayName, new.authorProfileImageUrl, new.authorChannelId,
                    new.likeCount, new.publishedAt, new.updatedAt, new.totalReplyCount, new.videoId);
            END;
            CREATE TRIGGER IF NOT EXISTS comments_ai AFTER INSERT ON comments BEGIN
                INSERT INTO comments_fts(docid, id, textDisplay, authorDisplayName, authorProfileImageUrl, authorChannelId,
                    likeCount, publishedAt, updatedAt, totalReplyCount, videoId)
                VALUES(new.rowid, new.id, new.textDisplay, new.authorDisplayName, new.authorProfileImageUrl, new.authorChannelId,
                    new.likeCount, new.publishedAt, new.updatedAt, new.totalReplyCount, new.videoId);
            END;
        `);

        this._db.prepare('CREATE INDEX IF NOT EXISTS comment_index ON comments(videoId, publishedAt, likeCount)').run();

        setInterval(() => this.cleanup(), 1 * DAY);
    }

    checkVideo(videoId) {
        const actuallyInProgress = this._videosInProgress.has(videoId);
        const row = this._db.prepare('SELECT * FROM videos WHERE id = ?').get(videoId);
        return {row, actuallyInProgress};
    }

    addVideo(video) {
        const now = new Date().getTime();
        this._db.prepare('INSERT OR REPLACE INTO videos(id, initialCommentCount, retrievedAt, lastUpdated, rawObject, inProgress)' +
                ' VALUES(?, ?, ?, ?, ?, true)')
            .run(video.id, video.statistics.commentCount, now, now, JSON.stringify(video));
        this._videosInProgress.add(video.id);
    }

    reAddVideo(video) {
        this._db.prepare('UPDATE videos SET lastUpdated = ?, rawObject = ?, inProgress = true WHERE id = ?')
            .run(new Date().getTime(), JSON.stringify(video), video.id);
        this._videosInProgress.add(video.id);
    }

    deleteVideo(videoId) {
        this._db.prepare('DELETE FROM videos WHERE id = ?').run(videoId);
    }

    abortVideo(videoId) { this._videosInProgress.delete(videoId); }

    getLastComment(videoId) {
        return this._db.prepare('SELECT id, MAX(publishedAt) FROM comments WHERE videoId = ?').get(videoId);
    }

    getComments(videoId, limit, offset, sortBy, minDate, maxDate, searchTerms) {
        searchTerms = searchTerms || undefined;
        let rows;
        let count;
        if (typeof searchTerms === "undefined") {
            count = this._db.prepare('SELECT COUNT(*) FROM comments WHERE videoId = ? AND publishedAt >= ? AND publishedAt <= ?')
                .get(videoId, minDate, maxDate)['COUNT(*)'];
            rows = this._db.prepare(`SELECT * FROM comments WHERE videoId = ? AND publishedAt >= ? AND publishedAt <= ?` +
                    ` ORDER BY ${sortBy} LIMIT ${Number(limit)} OFFSET ${Number(offset)}`)
                .all(videoId, minDate, maxDate);
        }
        else {
            // Ensure that any double quotes in search string are matched up (or tokenizer throws error).
            // If not, remove the last instance of double quote
            if ((searchTerms.split('"').length - 1) % 2 !== 0) {
                const pos = searchTerms.lastIndexOf('"');
                searchTerms = searchTerms.substring(0, pos) + searchTerms.substring(pos + 1);
            }

            try {
                count = this._db.prepare('SELECT COUNT(*) FROM comments_fts WHERE videoId = ? AND textDisplay MATCH ?' +
                        ' AND publishedAt >= ? AND publishedAt <= ?')
                    .get(videoId, searchTerms, minDate, maxDate)['COUNT(*)'];
                rows = this._db.prepare(`SELECT * FROM comments_fts WHERE videoId = ? AND textDisplay MATCH ?` +
                        ` AND publishedAt >= ? AND publishedAt <= ? ORDER BY ${sortBy} LIMIT ${Number(limit)} OFFSET ${Number(offset)}`)
                    .all(videoId, searchTerms, minDate, maxDate);
            } catch(err) {
                logger.log('error', "Error getting comments for video %s with searchTerms %s: %o", videoId, searchTerms, err);
                return this.getComments(videoId, limit, offset, sortBy, minDate, maxDate, undefined);
            }
        }
        return {rows, count};
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
            .run(newCommentCount, new Date().getTime(), nextPageToken || null, videoId);
    }

    markVideoComplete(videoId) {
        this._db.prepare('UPDATE videos SET inProgress = false WHERE id = ?').run(videoId);
        this._videosInProgress.delete(videoId);
    }

    cleanup() {
        // Remove any videos with:
        // - under 10,000 comments & > 2 days untouched
        // - under 1M comments     & > 30 days untouched

        logger.log('info', "Starting database cleanup");
        const now = new Date().getTime();
        let info;

        info = this._db.prepare('DELETE FROM videos WHERE (lastUpdated < ?) AND (commentCount < 10000 OR inProgress = true)')
            .run(now - 2*DAY);
        logger.log('info', "Deleted rows with < %d comments: %d", 10000, info.changes);

        info = this._db.prepare('DELETE FROM videos WHERE (lastUpdated < ?) AND (commentCount < 1000000)')
            .run(now - 30*DAY);
        logger.log('info', "Deleted rows with < %d comments: %d", 1000000, info.changes);

        this._db.exec('VACUUM');
    }
}

module.exports = Database;