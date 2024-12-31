import { Section, SectionHeader } from '@/components/section';
import { Tag } from '@/components/tag';
import { TwitterCard } from '@/components/twitter-card';
import { MessageCircleIcon } from 'lucide-react';

const testimonials = [
  {
    verified: true,
    avatarUrl: '/twitter-steven.jpg',
    name: 'Steven Tey',
    handle: 'steventey',
    content: [
      'Open-source Mixpanel alternative just dropped → http://git.new/openpanel',
      'It combines the power of Mixpanel + the ease of use of @PlausibleHQ into a fully open-source product.',
      'Built by @CarlLindesvard and it’s already tracking 750K+ events 🤩',
    ],
    replies: 25,
    retweets: 68,
    likes: 648,
  },
  {
    verified: true,
    avatarUrl: '/twitter-pontus.jpg',
    name: 'Pontus Abrahamsson — oss/acc',
    handle: 'pontusab',
    content: ['Thanks, OpenPanel is a beast, love it!'],
    replies: 25,
    retweets: 68,
    likes: 648,
  },
  {
    verified: true,
    avatarUrl: '/twitter-piotr.jpg',
    name: 'Piotr Kulpinski',
    handle: 'piotrkulpinski',
    content: [
      'The Overview tab in OpenPanel is great. It has everything I need from my analytics: the stats, the graph, traffic sources, locations, devices, etc.',
      'The UI is beautiful ✨ Clean, modern look, very pleasing to the eye.',
    ],
    replies: 25,
    retweets: 68,
    likes: 648,
  },
  {
    verified: true,
    avatarUrl: '/twitter-greg.png',
    name: 'greg hodson 🍜',
    handle: 'h0dson',
    content: ['i second this, openpanel is killing it'],
    replies: 25,
    retweets: 68,
    likes: 648,
  },
  {
    verified: true,
    avatarUrl: '/twitter-jacob.jpg',
    name: 'Jacob 🍀 Build in Public',
    handle: 'javayhuwx',
    content: [
      "🤯 wow, it's amazing! Just integrate @OpenPanelDev into http://indiehackers.site last night, and now I can see visitors coming from all round the world.",
      'OpenPanel has a more beautiful UI and much more powerful features when compared to Umami.',
      '#buildinpublic #indiehackers',
    ],
    replies: 25,
    retweets: 68,
    likes: 648,
  },
  {
    verified: true,
    avatarUrl: '/twitter-lee.jpg',
    name: 'Lee',
    handle: 'DutchEngIishman',
    content: [
      'Day two of marketing.',
      'I like this upward trend..',
      'P.S. website went live on Sunday',
      'P.P.S. Openpanel by @CarlLindesvard is awesome.',
    ],
    replies: 25,
    retweets: 68,
    likes: 648,
  },
];

export default Testimonials;
export function Testimonials() {
  return (
    <Section className="container">
      <SectionHeader
        tag={
          <Tag>
            <MessageCircleIcon className="size-4" strokeWidth={1.5} />
            Testimonials
          </Tag>
        }
        title="What people say"
        description="What our customers say about us."
      />
      <div className="col md:row gap-4">
        <div className="col gap-4 flex-1">
          {testimonials.slice(0, testimonials.length / 2).map((testimonial) => (
            <TwitterCard key={testimonial.handle} {...testimonial} />
          ))}
        </div>
        <div className="col gap-4 flex-1">
          {testimonials.slice(testimonials.length / 2).map((testimonial) => (
            <TwitterCard key={testimonial.handle} {...testimonial} />
          ))}
        </div>
      </div>
    </Section>
  );
}
