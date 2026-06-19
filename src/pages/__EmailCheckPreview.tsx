// TEMPORARY preview harness for verifying the deliverability checker UI.
// Delete this file and its route after screenshotting.
import { useState } from 'react';
import { EmailHtmlConversionModal } from '@/components/EmailHtmlConversionModal';

const SAMPLE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="628"><rect width="1200" height="628" fill="#1a1a2e"/></svg>',
  );

export default function EmailCheckPreview() {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ padding: 24 }}>
      <button onClick={() => setOpen(true)}>open</button>
      <EmailHtmlConversionModal
        isOpen={open}
        onClose={() => setOpen(false)}
        imageUrl={SAMPLE}
        brand="FortunePlay"
      />
    </div>
  );
}
