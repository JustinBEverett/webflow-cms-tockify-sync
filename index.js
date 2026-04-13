import { AsyncLocalStorage } from 'async_hooks';
import fetchIcsFeed from "./ics-middleware.js";

const logContext = new AsyncLocalStorage();
const _log = console.log.bind(console);
const _error = console.error.bind(console);
console.log = (...args) => _log(`[${logContext.getStore() ?? 'default'}]`, ...args);
console.error = (...args) => _error(`[${logContext.getStore() ?? 'default'}]`, ...args);
import {
  fetchCalendars,
  fetchLocationsFromWebflow,
  fetchCategoriesFromWebflow,
  getEventsFromWebflow,
  createWebflowEvents,
  updateCalendarLastModified,
  updateWebflowEvent,
  deleteWebflowEvent
} from "./webflow-middleware.js";
import { fetchTockifyEventKind } from "./tockify-middleware.js";

// For recurring series with multiple upcoming occurrences, deduplicate by kind.
// Events are sorted chronologically and checked via the Tockify API in order.
// All 'mod' instances are kept. The first 'repeat' found is kept and we stop —
// all later occurrences are unneeded future repeats.
async function deduplicateByKind(events) {
  const bySeriesId = new Map();
  for (const ev of events) {
    if (!bySeriesId.has(ev.seriesId)) bySeriesId.set(ev.seriesId, []);
    bySeriesId.get(ev.seriesId).push(ev);
  }

  const result = [];
  for (const group of bySeriesId.values()) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }

    const sorted = [...group].sort((a, b) => a.start - b.start);

    for (const ev of sorted) {
      const kind = await fetchTockifyEventKind(ev.apiSlug, ev.calendarSlug);
      if (kind === 'mod') {
        result.push(ev);
      } else if (kind === 'repeat') {
        result.push(ev);
        break; // First repeat found — remaining occurrences are future duplicates
      }
    }
  }

  return result.map(({ seriesId, ...ev }) => ev);
}

function buildConfigFromEnv() {
  return {
    siteToken: process.env.SITE_TOKEN,
    calendarCollectionId: process.env.CALENDAR_COLLECTION_ID,
    eventCollectionId: process.env.EVENT_COLLECTION_ID,
    categoriesCollectionId: process.env.CATEGORIES_COLLECTION_ID,
    locationCollectionId: process.env.LOCATION_COLLECTION_ID,
  };
}

async function syncInstance(config) {
  console.log(`Starting sync for instance: ${config.instanceSlug || 'default'}`);
  const [calendars, locationIds, categoryIds] = await Promise.all([
    fetchCalendars(config),
    fetchLocationsFromWebflow(config),
    fetchCategoriesFromWebflow(config),
  ]);

  for (const calendar of calendars) {

    console.log(`Fetching ICS feed for calendar: ${calendar.name} (${calendar.slug})`);
    const icsData = await fetchIcsFeed(calendar.slug);
    console.log(`Fetched ${icsData.events.length} raw events for calendar: ${calendar.name}`);

    // Check if calendar needs updating
    const icsDate = new Date(icsData.headers['last-modified']);
    const webflowDate = calendar.lastModified ? new Date(calendar.lastModified) : new Date(0);
    const delta = icsDate - webflowDate;
    console.log(`ICS last modified: ${icsDate}, Webflow last modified: ${webflowDate}, Delta: ${delta} ms`);

    if (delta <= 0) {
      console.log(`Calendar ${calendar.name} is up to date. Skipping.`);
      continue;
    }

    icsData.events = await deduplicateByKind(icsData.events);
    console.log(`Deduplicated to ${icsData.events.length} events for calendar: ${calendar.name}`);

    try {
      const events = await getEventsFromWebflow(calendar.slug, config);
      console.log(`Webflow has ${events.length} events for calendar: ${calendar.name}`);

      if (events.length === 0) {
        console.log(`No events found in Webflow for calendar ${calendar.name}. Creating all events from ICS feed.`);
        await createWebflowEvents(icsData.events, calendar.slug, config, locationIds, categoryIds);

      } else {

        for (const icsEvent of icsData.events) {
          const matchingEvent = events.find(ev => ev.apiSlug === icsEvent.apiSlug);
          console.log(matchingEvent ? `Event ${icsEvent.name} already exists in Webflow.` : `Event ${icsEvent.name} does not exist in Webflow. Creating...`);

          if (!matchingEvent) {
            await createWebflowEvents([icsEvent], calendar.slug, config, locationIds, categoryIds);

          } else if (icsEvent.lastModified > matchingEvent.lastModified) {
            console.log(`Event ${icsEvent.name} is out of date in Webflow. Updating.`);
            try {
              await updateWebflowEvent(matchingEvent.id, icsEvent, config, locationIds, categoryIds);
            } catch (err) {
              console.error(`Error updating event ${icsEvent.name}:`, err);
              throw err;
            }
          }
        }

        for (const ev of events) {
          if (!ev.apiSlug) continue; // manually added event — leave it alone
          const matchingIcsEvent = icsData.events.find(icsEv => icsEv.apiSlug === ev.apiSlug);
          if (!matchingIcsEvent) {
            console.log(`Event ${ev.apiSlug} exists in Webflow but not in ICS feed. Deleting from Webflow.`);
            try {
              await deleteWebflowEvent(ev.id, config);
            } catch (err) {
              console.error(`Error deleting event ${ev.apiSlug}:`, err);
              throw err;
            }
          }
        }
      }

      console.log(`Updating calendar ${calendar.name} last modified to ${icsDate.toISOString()}`);
      await updateCalendarLastModified(calendar.id, icsDate, config);

    } catch (err) {
      console.error(`Error syncing calendar ${calendar.name}:`, err);
    }
  }
}

export async function main(event = {}) {
  const instances = event.instances || [buildConfigFromEnv()];
  await Promise.all(instances.map(config =>
    logContext.run(config.instanceSlug ?? 'default', () => syncInstance(config))
  ));
}
//main();
