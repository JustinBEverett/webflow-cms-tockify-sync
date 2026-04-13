import { WebflowClient } from 'webflow-api';
import dotenv from 'dotenv';
import fetchTockifyEventDetails from './tockify-middleware.js';
import slugify from 'slugify';

dotenv.config();

const webflow = await new WebflowClient({
  accessToken: process.env.SITE_TOKEN,
});
const locationIds = await fetchLocationsFromWebflow();
const categoryIds = await fetchCategoriesFromWebflow();

export async function fetchCalendars() {
  try {
    const resp = await webflow.collections.items.listItemsLive(process.env.CALENDAR_COLLECTION_ID);

    const calendars = resp.items.map(item => ({
      id: item.id,
      name: item.fieldData.name,
      slug: item.fieldData.slug,
      lastModified: item.fieldData['last-modified']
    }));
    return calendars;
  } catch (error) {
    console.error('Error fetching collection items:', error);
    throw error;
  }
}
export async function updateCalendarLastModified(id, newLastModified) {
  try {
    await webflow.collections.items.updateItemsLive(process.env.CALENDAR_COLLECTION_ID, {
      items: [{
        id: id,
        fieldData: {
          'last-modified': newLastModified.toISOString()
        }
      }]
    });
    console.log(`Updated calendar ${id} last modified to ${newLastModified.toISOString()}`);
  } catch (error) {
    console.error(`Error updating calendar ${id} last modified:`, error);
    throw error;
  }
}

export async function getEventsFromWebflow(calendarSlug) {
  try {
    const allItems = [];
    let offset = 0;
    const limit = 100;

    while (true) {
      const resp = await webflow.collections.items.listItemsLive(process.env.EVENT_COLLECTION_ID, { limit, offset });
      allItems.push(...resp.items);
      if (resp.items.length < limit) break;
      offset += limit;
    }

    return allItems
      .filter(item => item.fieldData['calendar-slug'] === calendarSlug)
      .map(item => ({
        id: item.id,
        slug: item.fieldData.slug,
        lastModified: new Date(item.fieldData['last-modified']),
        apiSlug: item.fieldData['api-slug'],
        recurring: item.fieldData['recurring'] || false
      }));
  } catch (error) {
    console.error('Error fetching event items:', error);
    throw error;
  }
}

async function buildEventFieldData(event, calendarSlug, eventDetails) {
  return {
    name: event.name,
    'last-modified': event.lastModified.toISOString(),
    'calendar-slug': calendarSlug,
    'api-slug': event.apiSlug,
    start: event.start.toISOString(),
    end: event.end.toISOString(),
    description: eventDetails.description || '',
    excerpt: event.excerpt || '',
    'image-url': event.imageUrl || '',
    'cta-label': eventDetails.ctaLabel || '',
    'cta-url': eventDetails.ctaUrl || '',
    'feature-event': eventDetails.pinned || false,
    'skip-details': eventDetails.skipDetails || false,
    'recurring': eventDetails.recurring || false,
    ...(locationIds ? { 'location-ref': locationIds?.find(loc => loc.calendarSlug === event.locationSlug)?.id } : {}),
    ...(categoryIds
      ? {
        'categories-ref': (event.categories || [])
          .map(cat => categoryIds.find(c => c.slug === slugify(cat, { lower: true, strict: true }))?.id)
          .filter(Boolean)
      }
      : {})
  };
}

export async function createWebflowEvents(events, calendarSlug) {
  for (const event of events) {
    try {
      const eventDetails = await fetchTockifyEventDetails(event.apiSlug, event.calendarSlug);
      const fieldData = await buildEventFieldData(event, calendarSlug, eventDetails);

      await webflow.collections.items.createItemLive(process.env.EVENT_COLLECTION_ID, {
        fieldData: { slug: event.slug, ...fieldData }
      });
      console.log(`Created event ${event.name} in Webflow for calendar ${calendarSlug}`);
    } catch (error) {
      console.error(`Error creating event ${event.name} in Webflow:`, error);
    }
  }
}

export async function updateWebflowEvent(eventId, event) {
  try {
    const eventDetails = await fetchTockifyEventDetails(event.apiSlug, event.calendarSlug);
    const fieldData = await buildEventFieldData(event, event.calendarSlug, eventDetails);

    await webflow.collections.items.updateItemsLive(process.env.EVENT_COLLECTION_ID, {
      items: [{
        id: eventId,
        fieldData
      }]
    });
    console.log(`Updated event ${eventId} in Webflow.`);
  } catch (error) {
    console.error(`Error updating event ${eventId} in Webflow:`, error);
    throw error;
  }
}

export async function deleteWebflowEvent(eventId) {
  try {
    await webflow.collections.items.deleteItems(process.env.EVENT_COLLECTION_ID, {
      items: [{ id: eventId }]
    });
    console.log(`Deleted event ${eventId} from Webflow.`);
  } catch (error) {
    console.error(`Error deleting event ${eventId} from Webflow:`, error);
    throw error;
  }
}

export async function fetchCategoriesFromWebflow() {
  try {
    const resp = await webflow.collections.items.listItemsLive(process.env.CATEGORIES_COLLECTION_ID);

    const categories = resp.items.map(item => ({
      id: item.id,
      name: item.fieldData.name,
      slug: item.fieldData.slug
    }));
    return categories;
  } catch (error) {
    console.error('Error fetching categories collection items:', error);
    throw error;
  }
}

export async function fetchLocationsFromWebflow() {
  try {
    console.log('Fetching locations from Webflow using collection ID:', process.env.LOCATION_COLLECTION_ID);
    const resp = await webflow.collections.items.listItemsLive(process.env.LOCATION_COLLECTION_ID);

    const locations = resp.items.map(item => ({
      id: item.id,
      name: item.fieldData.name,
      slug: item.fieldData.slug,
      calendarSlug: item.fieldData['calendar-slug']
    }));
    return locations;
  } catch (error) {
    console.error('Error fetching locations collection items:', error);
    throw error;
  }
}