export type QA = { q: string; a: string }

/**
 * The questions people ask before they email. One list, used by the FAQ
 * accordion on the Contact view (and the legacy long-scroll FAQ section).
 * Five questions, two or three sentences each: the accordion sits in a
 * fixed panel and more than that pushes the email row off the plate.
 */
export const FAQS: QA[] = [
  {
    q: 'What do you do?',
    a: 'I design and develop modern, responsive websites and digital experiences for individuals, businesses, and brands.',
  },
  {
    q: 'How fast can you start?',
    a: 'I can usually start small projects within a few days, while larger projects are scheduled based on their scope and requirements.',
  },
  {
    q: 'How much do you charge?',
    a: 'Pricing depends on the project scope, features, and complexity. Contact me with your requirements and I’ll provide a clear, customized quote.',
  },
  {
    q: 'Where are you based?',
    a: 'I’m based in the Philippines and can work remotely with clients across different time zones.',
  },
  {
    q: 'What happens after I write?',
    a: 'I’ll review your message, get back to you as soon as possible, and discuss the best next steps for your project.',
  },
]
