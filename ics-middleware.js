import axios from "axios";
import ical from "ical";
import slugify from "slugify";

const ICS_BASE_URL = "https://tockify.com/api/feeds/ics/";

export default async function fetchIcsFeed(feedSlug) {
  try {
    const res = await axios.get(`${ICS_BASE_URL}${feedSlug}`);
    const headers = res.headers;
    const data = ical.parseICS(res.data);

    const events = Object.values(data)
      .filter((ev) => ev.type === "VEVENT")
      .filter((ev) => new Date(ev.end) >= new Date()) // future events only
      .filter((ev) => new Date(ev.start) <= new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + 90)) // within next 1 week
      .map((ev) => ({
        name: ev.summary,
        excerpt: ev["TKF-CUSTOM-PREVIEW"] || "",
        slug: slugify(ev.summary, { lower: true, strict: true }).concat('-').concat(ev.start.toISOString().split('T')[0]),
        apiSlug: `${ev.url.split("/").slice(-2)[0]}-0-${ev.url
          .split("/")
          .slice(-2)[1]}-0`,
        lastModified: new Date(ev.lastmodified),
        calendarSlug: feedSlug,
        start: new Date(ev.start),
        end: new Date(ev.end),
        imageUrl: ev['TKF-FEATURED-IMAGE'] || '',
        locationSlug: ev.location ? slugify(ev.location.split(',')[0], { lower: true, strict: true, replacement: '' }) : feedSlug,
        categories: ev.categories || []
      }));
    return {
      headers: headers,
      events: events
    };
  } catch (err) {
    console.error(`Error fetching/parsing feed ${feedSlug}:`, err);
    return [];
  }
}