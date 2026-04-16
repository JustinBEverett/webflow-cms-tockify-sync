import axios from "axios";
import ical from "ical";
import slugify from "slugify";

const ICS_BASE_URL = "https://tockify.com/api/feeds/ics/";
const EVENT_HORIZON = 90; // Number of days in the future to include events

export default async function fetchIcsFeed(feedSlug, instanceSlug = '') {
  try {
    const res = await axios.get(`${ICS_BASE_URL}${feedSlug}`);
    const headers = res.headers;
    const data = ical.parseICS(res.data);

    const now = new Date();
    // Use UTC midnight for both boundaries so ICS UTC times are compared consistently
    // regardless of what timezone the DO runtime is in
    const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const horizonUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + EVENT_HORIZON);

    const events = Object.values(data)
      .filter((ev) => ev.type === "VEVENT")
      .filter((ev) => {
        const start = new Date(ev.start);
        const end = new Date(ev.end);
        const startDayUTC = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
        const endDayUTC = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
        return endDayUTC > todayUTC && startDayUTC <= horizonUTC;
      })
      .filter((ev) => !instanceSlug || feedSlug === instanceSlug || !(ev.categories || []).includes("U-Prevent-Merge"))
      .map((ev) => {
        const urlParts = ev.url ? ev.url.split("/").slice(-2) : ['', '0'];
        return {
          name: ev.summary,
          excerpt: ev["TKF-CUSTOM-PREVIEW"] || "",
          slug: slugify(ev.summary, { lower: true, strict: true }).concat('-').concat(new Date(ev.start).toISOString().split('T')[0]),
          apiSlug: `${urlParts[0]}-0-${urlParts[1]}-0`,
          seriesId: urlParts[0],
          lastModified: new Date(ev.lastmodified),
          calendarSlug: feedSlug,
          start: new Date(ev.start),
          end: new Date(ev.end),
          imageUrl: ev['TKF-FEATURED-IMAGE'] || '',
          locationSlug: ev.location ? slugify(ev.location.split(',')[0], { lower: true, strict: true, replacement: '' }) : feedSlug,
          categories: ev.categories || []
        };
      });

    return {
      headers: headers,
      events: events
    };
  } catch (err) {
    console.error(`Error fetching/parsing feed ${feedSlug}:`, err);
    return [];
  }
}