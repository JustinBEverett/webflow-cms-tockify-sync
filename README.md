# tockify-sync-v2

A serverless function that synchronizes calendar events from [Tockify](https://tockify.com) into a [Webflow](https://webflow.com) CMS collection. Designed to run as a scheduled Digital Ocean Function.

## Overview

This function reads calendar event data from Tockify's ICS feeds and detailed event API, then creates, updates, or deletes the corresponding items in Webflow CMS collections. It uses timestamp-based delta sync to avoid unnecessary API calls — only calendars that have changed since the last run are processed.

### Data Flow

```
Tockify ICS Feed
      ↓
  Parse & Transform (ics-middleware.js)
      ↓
  Compare with Webflow (index.js)
      ↓
  Create / Update / Delete (webflow-middleware.js)
      ↓
  Update last-modified timestamp
```

## Features

- **Delta sync** — skips calendars that haven't changed since the last run
- **Full sync option** — force re-sync all events by setting `PERFORM_FULL_SYNC = true`
- **Future events only** — filters out past events automatically
- **90-day window** — only syncs events occurring within the next 90 days
- **Rich event data** — fetches descriptions and CTAs from Tockify's detail API beyond what's in the ICS feed
- **Reference resolution** — maps events to Webflow location and category collection items

## Prerequisites

- Node.js (ES module support required)
- A [Tockify](https://tockify.com) account with one or more calendars
- A [Webflow](https://webflow.com) site with CMS collections for calendars, events, locations, and categories
- A Webflow API token with CMS access

## Webflow CMS Structure

The function expects four Webflow CMS collections:

| Collection | Purpose |
|---|---|
| Calendars | One item per Tockify calendar, stores the ICS feed slug and `last-modified` timestamp |
| Events | The synced event items |
| Locations | Reference items for event venues |
| Categories | Reference items for event categories |

Each Calendar item must have a field containing the Tockify ICS feed slug (e.g. `my-calendar` from `tockify.com/api/feeds/ics/my-calendar`).

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/<your-username>/tockify-sync-v2.git
cd tockify-sync-v2
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy the example below into a `.env` file at the project root:

```env
SITE_TOKEN=your_webflow_api_token
SITE_ID=your_webflow_site_id
CALENDAR_COLLECTION_ID=your_calendar_collection_id
EVENT_COLLECTION_ID=your_event_collection_id
CATEGORIES_COLLECTION_ID=your_categories_collection_id
LOCATION_COLLECTION_ID=your_location_collection_id
```

For a separate development environment, create a `.env-dev` file with your staging Webflow credentials.

### 4. Run locally

Uncomment the `main()` call at the bottom of `index.js`, then:

```bash
node index.js
```

## Deployment (Digital Ocean Functions)

This function is structured for [Digital Ocean Functions](https://docs.digitalocean.com/products/functions/).

1. Ensure your `project.yml` includes this function under the `moments` package.
2. Set the environment variables in the Digital Ocean console or via the `doctl` CLI.
3. Deploy with:

```bash
doctl serverless deploy .
```

4. Schedule the function using a Digital Ocean trigger (cron) to run on your desired interval (e.g. every hour).

## Configuration

Two constants near the top of `index.js` control sync behavior:

| Constant | Default | Description |
|---|---|---|
| `PERFORM_FULL_SYNC` | `false` | Set to `true` to force re-sync all events regardless of last-modified timestamps |

The ICS fetch window is hardcoded to **90 days** in `ics-middleware.js`.

## Project Structure

```
tockify-sync-v2/
├── index.js               # Entry point — orchestrates the sync loop
├── ics-middleware.js      # Fetches and parses Tockify ICS feeds
├── tockify-middleware.js  # Fetches detailed event data from Tockify API
├── webflow-middleware.js  # Reads and writes Webflow CMS collections
└── package.json
```

## Dependencies

| Package | Purpose |
|---|---|
| `axios` | HTTP requests to Tockify and Webflow APIs |
| `ical` | Parse iCalendar (ICS) format |
| `slugify` | Generate URL-safe slugs for events and locations |
| `webflow-api` | Official Webflow API client |
| `dotenv` | Load environment variables from `.env` files |

## License

MIT
