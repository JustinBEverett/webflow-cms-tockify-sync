import axios from "axios";

const TOCKIFY_API_BASE = "https://tockify.com/api/ngevent/";

export async function fetchTockifyEventKind(tockifySlug, calendarSlug) {
  try {
    const resp = await axios.get(`${TOCKIFY_API_BASE}${tockifySlug}`, {
      params: { view: "detail", calname: calendarSlug, max: 1 }
    });
    return resp.data.events[0]?.kind || 'singleton';
  } catch (err) {
    console.error(`Error fetching kind for ${tockifySlug}:`, err);
    return 'singleton';
  }
}

export default async function fetchTockifyEventDetails(tockifySlug, calendarSlug) {
  try {
    const resp = await axios.get(`${TOCKIFY_API_BASE}${tockifySlug}`, {
      params: {
        view: "detail",
        calname: calendarSlug,
        max: 1
      },
    });
    const event = resp.data.events[0];
    const eventDetails = {
      description: event.content.description.text || '',
      ctaLabel: event.content.customButtonText || '',
      ctaUrl: event.content.customButtonLink || '',
      pinned: event.sorter.split('_')[0] === '090' ? true : false,
      skipDetails: event.content.noDetail ? true : false,
      recurring: event.kind === 'repeat' ? true : false
    }
    return eventDetails;
  } catch (err) {
    console.error(`Error fetching Tockify event details for ${tockifySlug}:`, err);
    return null;
  }
}
