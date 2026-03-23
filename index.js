import fetchIcsFeed from "./ics-middleware.js";
import {
  fetchCalendars,
  getEventsFromWebflow,
  createWebflowEvents,
  updateCalendarLastModified,
  updateWebflowEvent,
  deleteWebflowEvent
} from "./webflow-middleware.js";

const PERFORM_FULL_SYNC = false; // Set to true to force full sync of all events

export async function main(event) {
  const calendars = await fetchCalendars();

  // Iterate through each calendar and check for updates
  for (const calendar of calendars) {

    // Fetch the ICS feed for the calendar
    console.log(`Fetching ICS feed for calendar: ${calendar.name} (${calendar.slug})`);
    const icsData = await fetchIcsFeed(calendar.slug);
    console.log(`Fetched ${icsData.events.length} events for calendar: ${calendar.name}`);

    // Compare last modified dates
    const icsDate = new Date(icsData.headers['last-modified']);
    const webflowDate = calendar.lastModified ? new Date(calendar.lastModified) : new Date(0);
    const delta = Math.abs(icsDate - webflowDate);
    console.log(`ICS last modified: ${icsDate}, Webflow last modified: ${webflowDate}, Delta: ${delta} ms`);
    
    // If ICS feed is newer, update Webflow
    if (delta > 0 || PERFORM_FULL_SYNC) {
      console.log(`Calendar ${calendar.name} is out of date by ${delta} ms. Needs update.`);

      // Fetch existing events from Webflow
      getEventsFromWebflow(calendar.slug).then(async events => {
        console.log(`Webflow has ${events.length} events for calendar: ${calendar.name}`);
        
        if (events.length === 0) {
          
          // If no events exist in Webflow, create all from ICS feed
          console.log(`No events found in Webflow for calendar ${calendar.name}. Creating all events from ICS feed.`);
          return createWebflowEvents(icsData.events, calendar.slug);

        } else {
          // Compare each ICS event with Webflow events
          for (const icsEvent of icsData.events) {
            const matchingEvent = events.find(ev => ev.apiSlug === icsEvent.apiSlug);
            console.log(matchingEvent ? `Event ${icsEvent.name} already exists in Webflow.` : `Event ${icsEvent.name} does not exist in Webflow. Creating...`);
            
            if (!matchingEvent) {
              
              // If event does not exist in Webflow, create it
              return createWebflowEvents([icsEvent], calendar.slug);

            } else if ((icsEvent.lastModified > matchingEvent.lastModified) || PERFORM_FULL_SYNC) {

              // If event exists but is outdated, update it
              console.log(`Event ${icsEvent.name} is out of date in Webflow. Needs update.`);
              try{
                await updateWebflowEvent(matchingEvent.id, icsEvent);
              } catch (err) {
                console.error(`Error updating event ${icsEvent.name}:`, err);
                throw err;
              }
            }
          }

          // Check for events that exist in Webflow but not in ICS feed
          for (const ev of events) {
            
            // Find matching ICS event
            const matchingIcsEvent = icsData.events.find(icsEv => icsEv.slug === ev.slug);
            
            if (!matchingIcsEvent) {
              // If no matching ICS event, consider deleting or archiving
              console.log(`Event ${ev.slug} exists in Webflow but not in ICS feed. Deleting from Webflow.`);
              try{
                await deleteWebflowEvent(ev.id);
              } catch (err) {
                console.error(`Error deleting event ${ev.slug}:`, err);
                throw err;
              }
            }
          }
        }
      })
      .then(()=>{
        // After all updates, set the calendar's last modified date to the ICS feed's last modified date
        console.log(`Updating calendar ${calendar.name} last modified to ${icsDate.toISOString()}`);
        return updateCalendarLastModified(calendar.id, icsDate);

      }).catch(err => {
        console.error(`Error fetching events for calendar ${calendar.name}:`, err);
      });
    } else {
      // No update needed
      console.log(`Calendar ${calendar.name} is up to date.`);
  }
}
}
//main();