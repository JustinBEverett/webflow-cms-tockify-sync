import fetchIcsFeed from "./ics-middleware.js";
import {
  fetchCalendars,
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


export async function main(event) {
  const calendars = await fetchCalendars();

  // Iterate through each calendar and check for updates
  for (const calendar of calendars) {

    // Fetch the ICS feed for the calendar
    console.log(`Fetching ICS feed for calendar: ${calendar.name} (${calendar.slug})`);
    const icsData = await fetchIcsFeed(calendar.slug);
    icsData.events = await deduplicateByKind(icsData.events);
    console.log(`Fetched ${icsData.events.length} events for calendar: ${calendar.name}`);

    try {
        // Fetch existing events from Webflow
        const events = await getEventsFromWebflow(calendar.slug);
        console.log(`Webflow has ${events.length} events for calendar: ${calendar.name}`);

        if (events.length === 0) {

          // If no events exist in Webflow, create all from ICS feed
          console.log(`No events found in Webflow for calendar ${calendar.name}. Creating all events from ICS feed.`);
          await createWebflowEvents(icsData.events, calendar.slug);

        } else {

          // Compare each ICS event with Webflow events
          for (const icsEvent of icsData.events) {
            const matchingEvent = events.find(ev => ev.apiSlug === icsEvent.apiSlug);
            console.log(matchingEvent ? `Event ${icsEvent.name} already exists in Webflow.` : `Event ${icsEvent.name} does not exist in Webflow. Creating...`);

            if (!matchingEvent) {

              // If event does not exist in Webflow, create it
              await createWebflowEvents([icsEvent], calendar.slug);

            } else {

              // If event exists but is outdated, update it
              console.log(`Event ${icsEvent.name} is out of date in Webflow. Needs update.`);
              try {
                await updateWebflowEvent(matchingEvent.id, icsEvent);
              } catch (err) {
                console.error(`Error updating event ${icsEvent.name}:`, err);
                throw err;
              }
            }
          }

          // Check for events that exist in Webflow but not in ICS feed
          for (const ev of events) {

            // Match by apiSlug (same key used for create/update)
            const matchingIcsEvent = icsData.events.find(icsEv => icsEv.apiSlug === ev.apiSlug);

            if (!matchingIcsEvent) {
              // If no matching ICS event, delete from Webflow
              console.log(`Event ${ev.apiSlug} exists in Webflow but not in ICS feed. Deleting from Webflow.`);
              try {
                await deleteWebflowEvent(ev.id);
              } catch (err) {
                console.error(`Error deleting event ${ev.apiSlug}:`, err);
                throw err;
              }
            }
          }
        }

        // After all updates, set the calendar's last modified date to now
        console.log(`Updating calendar ${calendar.name} last modified to ${new Date().toISOString()}`);
        await updateCalendarLastModified(calendar.id, new Date());

    } catch (err) {
      console.error(`Error syncing calendar ${calendar.name}:`, err);
    }
  }
}
main();
