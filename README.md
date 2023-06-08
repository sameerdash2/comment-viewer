## YouTube Comment Viewer 💬
A web app for sorting and filtering comments on YouTube videos. Enter any video link and the comments will start loading in the background.

Tech stack: JavaScript, SQLite, and a lot of CSS.

### Website
#### https://commentviewer.com

### Screenshots
![Filtering by date](pics/filter.png "Filtering by date")
![Graphing comments](pics/stats.png "Graphing comments")

### Features
- Load large numbers of comments (> 1 million)
- Sort comments by date (oldest to newest) or by likes
- Filter comments by date
- View exact publish timestamps for comments and videos
- See comment trends on an interactive graph
- Input direct links to a comment
- Works well on mobile

### Usage / APIs

You can open the website directly to a video by supplying the video ID as a URL parameter `v`. Example: https://commentviewer.com/?v=4VaqA-5aQTM. The `v=` value can also be a full YouTube URL itself, or the URL to a linked comment/reply.

### Changelog
For new changes, check out the [changelog](CHANGELOG.md).
