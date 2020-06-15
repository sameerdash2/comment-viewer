const sqlite = require('sqlite3');

class Database {
    constructor() {
        this._db = new sqlite.Database('database.sql');

        this._db.run('CREATE TABLE IF NOT EXISTS videos(id TINYTEXT PRIMARY KEY, commentCount INT, retrievedAt BIGINT, lastUpdated BIGINT, inProgress BOOL)');
    }

    checkVideo(videoId, callback) {
        this._db.get('SELECT * FROM videos WHERE id = ?', videoId, (err, row) => callback(row));
    }

    addVideo(video, callback) {
        let now = new Date().getTime();
        this._db.run('INSERT OR REPLACE INTO videos(id, commentCount, retrievedAt, lastUpdated, inProgress) VALUES(?, ?, ?, ?, ?)',
            [video.id, video.statistics.commentCount, now, now, true]);
        this._db.run('CREATE TABLE IF NOT EXISTS `' + video.id + '`(id TINYTEXT PRIMARY KEY, textDisplay TEXT, authorDisplayName TEXT, '
            + 'authorProfileImageUrl TINYTEXT, authorChannelId TINYTEXT, likeCount INT, publishedAt BIGINT, updatedAt BIGINT, '
            + 'totalReplyCount SMALLINT)', (result, err) => callback());
    }

    resetVideo(video, callback) {
        this._db.run('DELETE FROM videos WHERE id = ?', [video.id]);
        this._db.run('DROP TABLE IF EXISTS `' + video.id + '`', (result, err) => this.addVideo(video, callback));
    }

    getComments(videoId, number, offset, sortBy, callback) {
        this._db.all(`SELECT * FROM \`${videoId}\` ORDER BY ${sortBy} LIMIT ${number} OFFSET ${offset}`, (err, rows) => callback(rows));
    }

    getLastDate(videoId, callback) {
        this._db.get(`SELECT publishedAt FROM \`${videoId}\` ORDER BY publishedAt DESC LIMIT 1`, (err, row) => callback(row));
    }

    getAllDates(videoId, callback) {
        this._db.all(`SELECT publishedAt FROM \`${videoId}\` ORDER BY publishedAt DESC`, (err, rows) => callback(rows));
    }

    writeNewComments(videoId, comments) {
        let insert = [];
        for (let i = 0; i < comments.length; i++) { 
            insert.push(comments[i].id, comments[i].textDisplay, comments[i].authorDisplayName, comments[i].authorProfileImageUrl,
                comments[i].authorChannelId, comments[i].likeCount, comments[i].publishedAt, comments[i].updatedAt, comments[i].totalReplyCount);
        }
        let placeholders = comments.map((elem) => '(?,?,?,?,?,?,?,?,?)').join(',');

        let statement = this._db.prepare('INSERT OR REPLACE INTO `' + videoId + '`(id, textDisplay, authorDisplayName, authorProfileImageUrl, '
            + 'authorChannelId, likeCount, publishedAt, updatedAt, totalReplyCount) VALUES ' + placeholders);
        statement.run(insert);
        statement.finalize();

        this._db.run('UPDATE videos SET lastUpdated = ? WHERE id = ?', [new Date().getTime(), videoId]);
    }

    markVideoComplete(videoId) {
        this._db.run('UPDATE videos SET inProgress = false WHERE id = ?', [videoId]);
    }
}

module.exports = Database;