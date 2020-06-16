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