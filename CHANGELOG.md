### Note

This changelog is not exhaustive. It served as a useful record back in 2020–2021 when I used to work on many features and push them all at once, but nowadays most [new commits](https://github.com/sameerdash2/comment-viewer/commits/master/) are small hotfixes that go to production immediately.

---

### 3.3.4 (27 Dec 2023)
- Added dark mode (https://github.com/sameerdash2/comment-viewer/issues/14). Toggleable via a button in the footer.

### 3.3.3 (18 Jul 2023)
- Added page size option: show 25, 50, 100, or 500 comments at a time. (https://github.com/sameerdash2/comment-viewer/issues/3)
- Added support for passing video IDs or links as a URL parameter: `https://commentviewer.com/?v=4VaqA-5aQTM`. (https://github.com/sameerdash2/comment-viewer/issues/5)
- Added OpenSearch support: quickly open the site from the address bar in Chrome/Edge/Firefox/Safari.
    - Apparently Chrome disabled this feature in the past couple years -- you need to turn on the search engines manually in settings, which (imo) defeats the purpose.
    - In Edge, you can use tab-to-search once you've loaded the page for a first time.
    - In Firefox you can [manually add the search engine](https://support.mozilla.org/en-US/kb/add-or-remove-search-engine-firefox) once the page is loaded.
    - In Safari, I couldn't figure out how to access the site search (in my 5 minutes of testing) but it did recognize the site's OpenSearch engine.

### 3.3.2 (11 Apr 2023)
- Graph and statistics now show automatically for videos with under 100,000 comments
- Fixed "NaN%" showing in tab title
- Updated system to use Node 18
- Updated dependencies

### 3.3.1 (03 Feb 2022)
- Removed display of dislikes on videos (dislike counts have been unavailable since 2021-12-13)
    - If the API somehow returns a dislike count, it will be displayed in red.
- Better handling for videos with 0 comments
- Updated dependencies / resolved security vulnerabilities

### 3.3.0 (12 Nov 2021)
- Reworked database cleanup: Comments are now deleted in chunks of 10,000. This should stop the site becoming unresponsive during cleanup.
    - Amendment (21 Nov 2021): Chunk size reduced to 2500, as there was still some lag with 10,000. Cleanup also happens twice a week now (on Wednesdays and Saturdays)
- Removed the search feature entirely. This includes dropping the database FTS table, which should improve performance (especially cleanup). The last commit that included the enabled search feature has been tagged.
- Updated to Parcel 2 to resolve npm security warnings
- Handled missing dislike counts on videos. The YouTube API will stop returning dislike counts [on Dec 13, 2021](https://support.google.com/youtube/thread/134791097/update-to-youtube-dislike-counts).
- Graph y-axis now widens to display large numbers, instead of cutting them off
- Fixed graph combining two points across the DST "fall back" hours (the second 1 AM - 2 AM hour now appears as a separate data point)
- Handled strange case where video is missing metadata. Examples: https://www.youtube.com/watch?v=MOqm0qGJhpw, https://www.youtube.com/watch?v=TlGXDy5xFlw
- Fixed styling issues on page
- Updated to Node 16
- Updated dependencies

### 3.2.1 (02 Sep 2021)
- Disabled searching for now. Search queries were taking up to 30 seconds (much longer than normal) and blocking the main thread, making the entire site unresponsive. :( This probably won't be restored unless a feasible solution becomes available.
- Made criteria for fully re-fetching a video less strict. This means new, fast-rising videos will not have to start from 0% as often.
- Added an alert to reload the page after WebSocket connection lost
- Fixed lag on graph tooltip's position update
- Fixed a graph interval-change case where old left bound exceeds new right bound

### 3.2.0 (26 Aug 2021)
- Added new hover tooltip on graph
- Removed unused styles from Bootstrap CSS. This shaves off 138 KB (28% of page size)
- Switched SQLite search engine back to FTS4 from FTS5.
    - Since switching to FTS5 in January, the database has been throwing `SQLITE_CORRUPT_VTAB` "database disk image is malformed" errors on about 50% of text searches. 3.2.0 reverts to the FTS4 implementation which didn't have this issue, though we'll have to see if it scales well. This will also require the database to be reset once.
- Added button to clear search on search error
- Moved graph tools ("Aggregate by") to above the graph
- Removed "Initializing" progress bar animation
- Turned off auto retrieval for videos with <200 comments
- Refined statistics button
- Added logging for different possible states of video (appending to stored comments, re-fetching video, etc.)
- Fixed missing whitespace before "x hidden comments"
- Updated dependencies

### 3.1.4 (13 Mar 2021)
- Separated socket.io client script from bundled JS (improves load time)
- Icons are now served directly instead of loading from CDN
- Removed graph resize throttling

### 3.1.3 (10 Jan 2021)
- Better handling for YouTube API quota being exceeded
- Enabled SQLite WAL mode for better performance
- Switched search engine from FTS4 to FTS5 in hopes of better scalability
- Made database cleanup (somewhat) asynchronous as it was causing the entire site to stall
- Database cleanup is also stricter now (stores comments for less time than before) due to increased traffic
- Published date now shows for upcoming streams

### 3.1.2 (19 Nov 2020)
- Switched graphs to `distr: 1`, making interval changes smoother and improving x-axis temporal labels
- Prefer smaller intervals for the graph
- Limited graph y-axis to only whole numbers
- Added progress percentage in the tab title
- Fixed missing comma separators in statistics data
- Fixed lone comment icon showing up for live streams
- Updated to Node.js 14
- Updated various dependencies

### 3.1.1 (29 Aug 2020)
- Improved graph behavior when changing intervals

### 3.1.0 (03 Aug 2020)
- Added a search bar. All comments can be searched by text or author name, and the resulting subsets can be further sorted and/or filtered.
- Added filter by date. You can select any date range, making it easier to analyze hundreds of thousands of comments.
- Switched database library to `better-sqlite3`, reducing graph load times by up to 60% over `node-sqlite3`
- Graph now responds properly to resize events (it now debounces if throttled)
- Fixed linked comment card having shorter line height
- 1 milion comments limit will be lifted soon™, partially thanks to YouTube [relaxing](https://developers.google.com/youtube/v3/revision_history#july-29,-2020) their API quota policies

### 3.0.1 (22 Jul 2020)
- Removed "top commenters" for now due to slow performance and replaced it with "average comments per day"
- Switched to throttling instead of debouncing for graph resize

### 3.0.0 (21 Jul 2020)
- Revamped page to fresh new card layout
- Added more comment statistics, including total likes & top commenters
- Graph now loads in larger, quicker chunks
- Fixed some faulty counting logic causing progress to exceed 100%
- Slight improvements to input parsing
- Switched to proper bold font
- Fixed linked comment instantly disappearing for videos with under 200 comments
- Full video information is now stored in database (for future possibilities)
- Various performance and visual improvements

### 2.4.0 (09 Jul 2020)
- Stores the next pageToken to continue loading comments even after server crash
- Added 30-second timeout on API responses
- Fixed comments with identical timestamps being out of order (now preserves the order from API response)
- Linked comment now clears before loading all comments
- Graph height now shrinks if necessary (e.g. landscape mobile displays)
- Changed video metadata to use CSS float to reduce blank gaps
- Limited input to 255 characters
- Added ESLint and Parcel bundler
- Fixed Discussion tab linked comments breaking the page
- Fixed API errors due to extra whitespaces that seemed to somehow be the issue

### 2.3.1 (02 Jul 2020)
- Fixed trying to load videos with 0 comments
- Cached comments will be refreshed slightly more often
- Larger favicon

### 2.3.0 (29 Jun 2020)
- All comments now initially show a subset of their replies
- Load percentage now shows as many decimal points as necessary
- More loading indicators & responsive, restyled buttons
- Scaled down size of most elements

### 2.2.0 (25 Jun 2020)
- Added options for different intervals on the graph. Aggregate comments by hour, day, month, or year.
- Made optimizations on the comments fetch process. Loading over 1 million comments should (theoretically) be possible.
- Multiple users can now track the same video's load progress
- New fancy progress bar when loading
- Switched database schema to single table for all comments
- Switched to Cloudflare CDN for Font Awesome icons
- Fixed reply buttons not working after changing sort order
- Fixed "Linked Comment" indicator not showing up

### 2.1.1 (17 Jun 2020)
- Better dynamic resizing on window resize
- Added comment permalink on the comment numbers
- Updated home page to hide input box after enter
- Organized frontend code into different files
- Server now loads graph data in chunks of 1000 to ease CPU load
- Fixed load progress showing over 100% due to pinned comment & its replies being recounted
- Fixed RTL text not displaying properly

### 2.1.0 (16 Jun 2020)
- Switched to columns instead of raw JSON for storing comments. (75% space decrease!)
- Server no longer retains comments in memory; they are only served from the database.
- Scaled down font size on main page
- Added scheduled database pruning (to be improved)
- Added Google Analytics
- Fixed videos being added as fresh entries, resulting in the cached comments never updating
- Fixed crashing due to client socket timeout

### 2.0.0 (11 Jun 2020)
- Comments are now cached in a database, greatly reducing load times and quota usage. Any video with over 500 comments will be cached.
- Visual changes to support small/mobile displays
- Added terms of service
- Changed font to Open Sans
- Set graph minimum to always be 0, and maximum to be at least 5
- Reworked linked comment logic to be faster (and highlight the uploader's name)
- Input field now focuses on page load
- More responsive drag-zooming on graph
- Increased graph's y-axis padding to properly show large numbers
- Added handling for missing dates (e.g. stream start time on https://youtu.be/CD4hT4bLwnc)
- Several visual enchancements
- Fixed some faulty API error handling

### 1.2.0 (29 May 2020)
- Better no-image mode (no squares)
- Changed UTC date format to YYYY-MM-DD to transcend language
- Refactored backend into modules
- Fixed load button showing up for 0 comments
- Fixed timestamp link on linked comment

### 1.1.0 (19 May 2020)
- Hour/minute units on graph are now hidden
- Improved linked comment error handling for replies
- Relocated "view graph" button
- Replies will be retrieved on initial load for comments with over 100 replies
- Added footer with version number
