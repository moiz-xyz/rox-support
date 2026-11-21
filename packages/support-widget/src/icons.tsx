import * as React from "react";

type P = React.SVGProps<SVGSVGElement>;
const base = (path: React.ReactNode) => (props: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    {path}
  </svg>
);

export const IconChat = base(<path d="M21 12a8.5 8.5 0 0 1-12.4 7.6L3 21l1.4-5.1A8.5 8.5 0 1 1 21 12Z" />);
export const IconClose = base(<path d="M18 6 6 18M6 6l12 12" />);
export const IconChevronDown = base(<path d="m6 9 6 6 6-6" />);
export const IconSend = base(<><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>);
export const IconPaperclip = base(<path d="m21.4 11.6-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" />);
export const IconImage = base(<><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" /></>);
export const IconMic = base(<><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4" /></>);
export const IconMicOff = base(<><path d="M2 2l20 20M18.9 13.4A7 7 0 0 0 19 11v-1M5 10v1a7 7 0 0 0 11.2 5.6M15 9.3V5a3 3 0 0 0-5.7-1.3M9 9v2a3 3 0 0 0 5.1 2.1M12 18v4" /></>);
export const IconPhone = base(<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z" />);
export const IconPhoneOff = base(<><path d="M10.7 13.3a16 16 0 0 0 3.4 2.6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 3 4.2 2 2 0 0 1 5 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.4 2.1L9 9.8" /><path d="M22 2 2 22" /></>);
export const IconVolume = base(<><path d="M11 5 6 9H2v6h4l5 4V5Z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" /></>);
export const IconVolumeOff = base(<><path d="M11 5 6 9H2v6h4l5 4V5Z" /><path d="m23 9-6 6M17 9l6 6" /></>);
export const IconFile = base(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" /></>);
export const IconDownload = base(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5M12 15V3" /></>);
export const IconCheck = base(<path d="M20 6 9 17l-5-5" />);
export const IconCheckCheck = base(<><path d="M18 6 7 17l-5-5" /><path d="m22 10-7.5 7.5L13 16" /></>);
export const IconClock = base(<><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>);
export const IconReply = base(<><path d="m9 17-5-5 5-5" /><path d="M20 18v-2a4 4 0 0 0-4-4H4" /></>);
export const IconStop = base(<rect x="6" y="6" width="12" height="12" rx="2" />);
export const IconTrash = base(<><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>);
export const IconAlert = base(<><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></>);
export const IconVideo = base(<><path d="m16 13 5.2 3.5a.5.5 0 0 0 .8-.4V7.9a.5.5 0 0 0-.8-.4L16 11" /><rect x="2" y="6" width="14" height="12" rx="2" /></>);
export const IconVideoOff = base(<><path d="M10.7 6H14a2 2 0 0 1 2 2v3.3l1 1L22 8v8M16 16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2M2 2l20 20" /></>);
export const IconScreenShare = base(<><path d="M13 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-3M8 21h8M12 17v4" /><path d="m17 8 5-5M17 3h5v5" /></>);
export const IconScreenOff = base(<><path d="M13 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-3M8 21h8M12 17v4" /><path d="m22 3-5 5M17 3l5 5" /></>);
export const IconFlip = base(<><path d="M20 7h-3.5l-2-3h-5l-2 3H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Z" /><path d="M9 13a3 3 0 0 1 5.2-2M15 13a3 3 0 0 1-5.2 2M14 9v2h2M10 17v-2H8" /></>);
