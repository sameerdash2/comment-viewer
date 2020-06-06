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
        this._db.run('CREATE TABLE IF NOT EXISTS `' + video.id + '`(timestamp TINYTEXT, comment MEDIUMTEXT)', (result, err) => callback());
    }

    resetVideo(video, callback) {
        this._db.run('DELETE FROM videos WHERE id = ?', [video.id]);
        this._db.run('DROP TABLE IF EXISTS `' + video.id + '`', (result, err) => this.addVideo(video, callback));
    }

    getComments(videoId, callback) {
        this._db.all('SELECT comment FROM `' + videoId + '` ORDER BY timestamp DESC', (err, rows) => callback(rows));
    }

    writeNewComments(videoId, comments) {
        let insert = [];
        for (let i = 0; i < comments.length; i++) {            
            insert.push(comments[i].snippet.topLevelComment.snippet.publishedAt, JSON.stringify(comments[i]));
        }
        let placeholders = comments.map((elem) => '(?,?)').join(',');

        let statement = this._db.prepare('INSERT INTO `' + videoId + '`(timestamp, comment) VALUES ' + placeholders);
        statement.run(insert);
        statement.finalize();

        this._db.run('UPDATE videos SET lastUpdated = ? WHERE id = ?', [new Date().getTime(), videoId]);
    }

    markVideoComplete(videoId) {
        this._db.run('UPDATE videos SET inProgress = false WHERE id = ?', [videoId]);
    }
}

module.exports = Database;