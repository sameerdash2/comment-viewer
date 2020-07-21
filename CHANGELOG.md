**3.0.0** (21 July 2020)
- Revamped page to fresh new card layout
- Added more comment statistics, including total likes & top commenters
- Graph now loads in larger, quicker chunks
- Fixed some faulty counting logic causing progress to exceed 100%
- Slight improvements to input parsing
- Switched to proper bold font
- Fixed linked comment instantly disappearing for videos with under 200 comments
- Full video information is now stored in database (for future possibilities)
- Various performance and visual improvements

**2.4.0** (09 July 2020)
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

**2.3.1** (02 July 2020)
- Fixed trying to load videos with 0 comments
- Cached comments will be refreshed slightly more often
- Larger favicon

**2.3.0** (29 June 2020)
- All comments now initially show a subset of their replies
- Load percentage now shows as many decimal points as necessary
- More loading indicators & responsive, restyled buttons
- Scaled down size of most elements

**2.2.0** (25 June 2020)
- Added options for different intervals on the graph. Aggregate comments by hour, day, month, or year.
- Made optimizations on the comments fetch process. Loading over 1 million comments should (theoretically) be possible.
- Multiple users can now track the same video's load progress
- New fancy progress bar when loading
- Switched database schema to single table for all comments
- Switched to Cloudflare CDN for Font Awesome icons
- Fixed reply buttons not working after changing sort order
- Fixed "Linked Comment" indicator not showing up

**2.1.1** (17 June 2020)
- Better dynamic resizing on window resize
- Added comment permalink on the comment numbers
- Updated home page to hide input box after enter
- Organized frontend code into different files
- Server now loads graph data in chunks of 1000 to ease CPU load
- Fixed load progress showing over 100% due to pinned comment & its replies being recounted
- Fixed RTL text not displaying properly

**2.1.0** (16 June 2020)
- Switched to columns instead of raw JSON for storing comments. (75% space decrease!)
- Server no longer retains comments in memory; they are only served from the database.
- Scaled down font size on main page
- Added scheduled database pruning (to be improved)
- Added Google Analytics
- Fixed videos being added as fresh entries, resulting in the cached comments never updating
- Fixed crashing due to client socket timeout

**2.0.0** (11 June 2020)
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

**1.2.0** (29 May 2020)
- Better no-image mode (no squares)
- Changed UTC date format to YYYY-MM-DD to transcend language
- Refactored backend into modules
- Fixed load button showing up for 0 comments
- Fixed timestamp link on linked comment

**1.1.0** (19 May 2020)
- Hour/minute units on graph are now hidden
- Improved linked comment error handling for replies
- Relocated "view graph" button
- Replies will be retrieved on initial load for comments with over 100 replies
- Added footer with version number