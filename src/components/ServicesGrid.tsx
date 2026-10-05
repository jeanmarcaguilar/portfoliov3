import type { CSSProperties } from 'react'
import { MagnetStraight, Timer, Trophy } from '@/components/slab'
import type { Icon } from '@/components/slab'

/**
 * ServicesGrid - the Gear view on one glass sheet.
 *
 * Two bands, top to bottom: your setup philosophy (on a dark plate)
 * and the gear list grouped by category (image, name, short description).
 */

/* ---------- The method ---------- */

type Stage = {
  index: string
  label: string
  body: string
  Icon: Icon
  chips: string[]
}

const STAGES: Stage[] = [
  {
    index: '01',
    label: 'Desk Setup',
    body: 'The hardware ecosystem that powers my daily work.',
    Icon: MagnetStraight,
    chips: ['Monitor', 'Keyboard', 'Mouse', 'Stand'],
  },
  {
    index: '02',
    label: 'Everyday Carry',
    body: 'Essential tools that keep me productive on the go.',
    Icon: Timer,
    chips: ['Laptop', 'Phone', 'Tablet', 'Headphones'],
  },
  {
    index: '03',
    label: 'Personal Care',
    body: 'Wellness essentials that maintain my energy and focus.',
    Icon: Trophy,
    chips: ['Hydration', 'Lighting', 'Ergonomics', 'Rest'],
  },
]

/* ---------- The gear list ---------- */

type GearItem = {
  name: string
  description: string
  image: string // put your product photos in /public/gear and point to them here
  url?: string // shop link; when set, the whole card becomes clickable
}

type GearGroup = {
  label: string
  items: GearItem[]
}

const GEAR: GearGroup[] = [
  {
    label: 'Desk Setup',
    items: [
      {
        name: 'Redragon Fizz RGB Wired Mechanical Gaming Keyboard',
        description: 'My daily driver for typing and coding.',
        image: '/gear/keyboard.png',
        url: 'https://ecommerce.datablitz.com.ph/collections/all/products/redragon-fizz-rgb-wired-mechanical-gaming-keyboard-black-dust-proof-red-k617-rgb',
      },
      {
        name: 'MAG 255F X24',
        description: 'Main display for development and design work.',
        image: '/gear/monitor.png',
        url: 'https://www.msi.com/Monitor/MAG-255F-X24',
      },
      {
        name: 'Nitro 5 Intel',
        description: 'The machine that powers everything I build.',
        image: '/gear/Laptop.png',
        url: 'https://www.acer.com/ph-en/laptops/nitro/nitro-5/pdp/NH.QFHSP.002',
      },
      {
        name: 'Mouse',
        description: 'Comfortable and precise for long work sessions.',
        image: '/gear/mouse.png',
        url: 'https://shopee.ph/MLOONG-MX301-PRO-Wireless-Gaming-Mouse-PAW3315-Tri-Mode-Ultra-Lightweight-57g-Ergonomic-Design-i.462016051.47760214604?extraParams=%7B%22display_model_id%22%3A262602898169%2C%22model_selection_logic%22%3A3%7D',
      },
      {
        name: 'Laptop And Monitor Stand',
        description: 'Keeps my setup elevated and ergonomic.',
        image: '/gear/laptop and stand.png',
        url: 'https://shopee.ph/True-Vision-Dual-Counterbalance-Monitor-Stand-and-Laptop-Holder-TV13-C024ENBH2-i.25356896.10586495495?extraParams=%7B%22display_model_id%22%3A142352923295%2C%22model_selection_logic%22%3A3%7D',
      },
      {
        name: 'Redragon Beryl Gaming Monitor Light',
        description: 'Lights up my desk during late-night sessions.',
        image: '/gear/Light.png',
        url: 'https://ecommerce.datablitz.com.ph/collections/all/products/redragon-beryl-gaming-monitor-light-gml-113',
      },
    ],
  },
  {
    label: 'Everyday Carry',
    items: [
      {
        name: 'Xiaomi 11T',
        description: 'My main phone — always in my pocket.',
        image: '/gear/Xiaomi 11T.png',
        url: 'https://www.mi.com/global/product/xiaomi-11t/',
      },
      {
        name: 'Iphone 8Plus',
        description: 'My secondary phone for backup and other tasks.',
        image: '/gear/8plus.png',
        url: 'https://revibe.ph/products/iphone-8-plus?variant=52959649137012',
      },
      {
        name: 'JBL Wave Beam 2 True Wireless Earbuds',
        description: 'For calls and music wherever I go.',
        image: '/gear/Airpods.png',
        url: 'https://shopee.ph/JBL-Wave-Beam-2-True-wireless-earbuds-Spoyl-Store-i.1146036267.25057908280?extraParams=%7B%22display_model_id%22%3A147511943165%2C%22model_selection_logic%22%3A3%7D',
      },
      {
        name: 'OPK Watch',
        description: 'Keeps me on time and tracks my day.',
        image: '/gear/Watch.png',
        url: 'https://shopee.ph/OPK-Watch-Man-Original-Waterproof-Silver-Black-Stainless-Steel-Quartz-Dual-Calendar-Luminous-Watches-For-Mens-Non-Tarnish-With-Box-i.82612574.10603475822?extraParams=%7B%22display_model_id%22%3A75389338380%2C%22model_selection_logic%22%3A3%7D',
      },
      {
        name: 'Coffee Mug',
        description: 'Keeps me hydrated throughout the day.',
        image: '/gear/Tumbler.png',
        url: 'https://shopee.ph/Peliflask-Stainless-Steel-Thermal-Coffee-Mug-With-Coffee-Mug-Wood-Grain-Handle-With-Lid-Straw-15oz-i.1013475336.51309547994?extraParams=%7B%22display_model_id%22%3A365843977203%2C%22model_selection_logic%22%3A3%7D',
      },
    ],
  },
  {
    label: 'Daily Essentials',
    items: [
      {
        name: 'OLD SPICE High Endurance Pure Sport',
        description: 'Keeps me fresh throughout the day.',
        image: '/gear/Old Spice.png',
        url: 'https://www.watsons.com.ph/old-spice-old-spice-high-endurance-pure-sport-45g/p/BP_10016066',
      },
      {
        name: 'X90',
        description: 'My go-to scent for everyday wear.',
        image: '/gear/X90.png',
        url: 'https://bestperfume.store/products/x90?variant=45670034866498&country=PH&currency=PHP&utm_medium=product_sync&utm_source=google&utm_content=sag_organic&utm_campaign=sag_organic&gad_source=4&gad_campaignid=24252821210&gbraid=0AAAAAooUWbE0K2AKjp1aeGfUMi8EyrSlr&gclid=CjwKCAjwq8PVBhAKEiwA2i3SHbit_aNpkXoYOXLuaaJRJTiUpO9qY4zhPHcm3tchY1EqA9B0wvp-2RoC618QAvD_BwE',
      },
      {
        name: 'Andrea Secret',
        description: 'My alternate scent for other occasions.',
        image: '/gear/Perfume 1.png',
        url: 'https://shopee.ph/Andrea-Secret-Dual-Charm-Collection-Confident-Blooms-Iron-Legacy-Sexy-Perfume-for-Men-i.1310673883.27562921391?extraParams=%7B%22display_model_id%22%3A256704648533%2C%22model_selection_logic%22%3A3%7D',
      },
    ],
  },
]

/** One gear card. With a `url` the whole card is a link that opens the shop in a new tab. */
function GearCard({ item }: { item: GearItem }) {
  const body = (
    <>
      <span className="sgrid__gear-photo">
        <img src={item.image} alt={item.url ? '' : item.name} loading="lazy" decoding="async" />
      </span>
      <span className="sgrid__gear-name">{item.name}</span>
      <span className="sgrid__gear-desc">{item.description}</span>
    </>
  )

  return (
    <li className="sgrid__gear-card">
      {item.url ? (
        <a
          className="sgrid__gear-link"
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${item.name} - view in shop (opens in a new tab)`}
        >
          {body}
        </a>
      ) : (
        <div className="sgrid__gear-link">{body}</div>
      )}
    </li>
  )
}

/* ---------- The page ---------- */

export default function ServicesGrid() {
  return (
    <>
      <header className="pgrid__head">
        <span className="pgrid__eyebrow">Gear</span>
        <h1 className="pgrid__title" id="gear-title">
          The hardware and tools I use to build, create, and stay productive.
        </h1>
        <p className="pgrid__lede">
          My desk setup, everyday carry, and personal care essentials.
        </p>
      </header>

      <div className="home__glass sgrid__glass">
        {/* One dark plate, the headline on the left, the three stages wired
            in order on the right with a signal running them. */}
        <div className="sgrid__method" aria-labelledby="method-title" style={{ animationDelay: '0s' } as CSSProperties}>
          <div className="sgrid__method-copy">
            <span className="sgrid__method-eyebrow">My Setup Philosophy</span>
            <h2 className="sgrid__method-title" id="method-title">
              Desk. Carry. Care.
              <br />
              <span>My gear approach, in three categories.</span>
            </h2>
            <p className="sgrid__method-sub">
              Intentional tools that support productivity without clutter.
            </p>
          </div>

          <ol className="sgrid__stages" role="list">
            {STAGES.map((s, i) => {
              const StageIcon = s.Icon
              return (
                <li key={s.index} className="sgrid__stage" style={{ '--i': i } as CSSProperties}>
                  <span className="sgrid__stage-ghost" aria-hidden="true">{s.index}</span>
                  <span className="sgrid__stage-icon" aria-hidden="true">
                    <StageIcon size={22} weight="duotone" />
                  </span>
                  <h3 className="sgrid__stage-label">{s.label}.</h3>
                  <p className="sgrid__stage-body">{s.body}</p>
                  <ul className="sgrid__stage-chips" role="list" aria-label={`${s.label} touches`}>
                    {s.chips.map((c) => (
                      <li key={c} className="sgrid__stage-chip">{c}</li>
                    ))}
                  </ul>
                </li>
              )
            })}
          </ol>
        </div>

        {/* The gear list, grouped by category. */}
        <div className="sgrid__gear" style={{ animationDelay: '0.15s' } as CSSProperties}>
          {GEAR.map((group) => (
            <section key={group.label} className="sgrid__gear-group" aria-label={group.label}>
              <h2 className="sgrid__gear-label">{group.label}</h2>
              <ul className="sgrid__gear-list" role="list">
                {group.items.map((item) => (
                  <GearCard key={item.name} item={item} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </>
  )
}