export function tooltipPlugin(isUtc) {
    function init(u) {
        const over = u.root.querySelector(".u-over");

        const tooltip = u.cursortt = document.createElement("div");
        tooltip.id = "tooltip";
        tooltip.style.display = "none";
        over.appendChild(tooltip);

        over.addEventListener("mouseleave", () => {
            tooltip.style.display = "none";
        });

        over.addEventListener("mouseenter", () => {
            tooltip.style.display = null;
        });
    }

    function setCursor(u) {
        const { left, top, idx } = u.cursor;
        if (idx === null || !u.data[0][idx]) return;

        // Update text
        const xVal = u.data[0][idx];
        const yVal = u.data[1][idx];
        u.cursortt.innerHTML = `<b>${makeLabel(xVal, u.cvInterval, isUtc)}</b><br>Comments: ${yVal.toLocaleString()}`;

        // Update positioning
        // Set instant timeout to allow the text width to update
        setTimeout(() => {
            let xPos = left + 10;
            const yPos = top + 10;

            const tooltipWidth = u.cursortt.offsetWidth;
            const graphOffset = u.root.querySelector(".u-over").getBoundingClientRect().left;

            if ((graphOffset + xPos + tooltipWidth * 1.2) > document.documentElement.clientWidth) {
                xPos -= (tooltipWidth + 20);
            }

            u.cursortt.style.left = xPos + "px";
            u.cursortt.style.top = yPos + "px";
        }, 0);
    }

    return {
        hooks: {
            init,
            setCursor
        }
    };
}

function makeLabel(rawValue, interval, isUtc) {
    let output = "";
    const date = new Date(rawValue * 1000);
    switch (interval) {
        case "year":
            output = isUtc ? date.getUTCFullYear() : date.getFullYear();
            break;
        case "month":
            output = isUtc ? date.toLocaleDateString("en-ca", { timeZone: "UTC", month: "2-digit", year: "numeric" })
                : date.toLocaleString(undefined, { month: "short", year: "numeric" })
            break;
        case "day":
            output = isUtc ? date.toISOString().substring(0, 10) : date.toLocaleDateString();
            break;
        case "hour":
            output = isUtc ? date.toISOString().replace("T", " ").substring(0, 16)
                : date.toLocaleDateString(undefined, { hour: "numeric", hour12: true });
            break;
    }
    return output;
}

export function calcAxisSpace(interval, scaleMin, scaleMax, plotDim) {
    const rangeSecs = scaleMax - scaleMin;
    let space = 50;
    switch (interval) {
        case "year": {
            // ensure minimum x-axis gap is 360 days' worth of pixels
            const rangeDays = rangeSecs / 86400;
            const pxPerDay = plotDim / rangeDays;
            space = pxPerDay * 360;
            break;
        }
        case "month": {
            // 28 days
            const rangeDays = rangeSecs / 86400;
            const pxPerDay = plotDim / rangeDays;
            space = pxPerDay * 28;
            break;
        }
        case "day": {
            // 23 hours
            const rangeHours = rangeSecs / 3600;
            const pxPerHour = plotDim / rangeHours;
            space = pxPerHour * 23;
            break;
        }
        case "hour": {
            // 59 minutes
            const rangeMins = rangeSecs / 60;
            const pxPerMin = plotDim / rangeMins;
            space = pxPerMin * 59;
            break;
        }
    }
    // Use a minimum gap of 50 pixels
    return Math.max(50, space);
}