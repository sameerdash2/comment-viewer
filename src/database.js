const sqlite = require('sqlite3');

class Database {
    constructor() {
        this._db = new sqlite.Database('database.sql');

        this._db.run('CREATE TABLE IF NOT EXISTS videos(id TINYTEXT PRIMARY KEY, retrievedAt BIGINT, inProgress BOOL)');
    }

    checkVideo(videoId, callback) {
        this._db.get('SELECT * FROM videos WHERE id = ?', videoId, (err, row) =>  callback(row));
    }

    addVideo(videoId) {
        this._db.run('INSERT OR REPLACE INTO videos(id, retrievedAt, inProgress) VALUES(?, ?, ?)',
            [videoId, new Date().getTime(), true]);
        this._db.run('CREATE TABLE IF NOT EXISTS`' + videoId + '`(timestamp TINYTEXT, comment MEDIUMTEXT)');
    }

    getLastComment(videoId, callback) {
        this._db.get('SELECT * FROM `' + videoId + '` ORDER BY timestamp DESC LIMIT 1', (err, row) => callback(row));
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
    }

    markVideoComplete(videoId) {
        this._db.run('UPDATE videos SET inProgress = false WHERE id = ?', [videoId]);
    }
}

module.exports = Database;