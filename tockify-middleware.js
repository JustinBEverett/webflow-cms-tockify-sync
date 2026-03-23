import axios from "axios";

const TOCKIFY_API_BASE = "https://tockify.com/api/ngevent/";

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
      ctaUrl: event.content.customButtonLink || ''
    }
    return eventDetails;
  } catch (err) {
    console.error(`Error fetching Tockify event details for ${tockifySlug}:`, err);
    return null;
  }
}
