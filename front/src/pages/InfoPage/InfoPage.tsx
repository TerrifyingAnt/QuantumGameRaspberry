import { useMemo, useRef } from 'react'
import { Swiper, SwiperSlide } from 'swiper/react'
import { EffectCoverflow } from 'swiper/modules'
import type { Swiper as SwiperInstance } from 'swiper'
import 'swiper/css'
import 'swiper/css/effect-coverflow'

import { ALL_CARD_IDS } from '../../data/cards'
import { getCardImageUrl } from '../../lib/assets'
import s from './InfoPage.module.css'

const CARD_COUNT = ALL_CARD_IDS.length

function fixLoopPosition(swiper: SwiperInstance) {
  const index = swiper.activeIndex

  if (index < CARD_COUNT) {
    swiper.slideTo(index + CARD_COUNT, 0)
    return
  }

  if (index >= CARD_COUNT * 2) {
    swiper.slideTo(index - CARD_COUNT, 0)
  }
}

/** Справочник карт (онлайн — без записи на NFC-метки). */
export const InfoPage = () => {
  const swiperRef = useRef<SwiperInstance | null>(null)

  const slides = useMemo(
    () => [...ALL_CARD_IDS, ...ALL_CARD_IDS, ...ALL_CARD_IDS],
    [],
  )

  return (
    <>
      <header className={s.header}>
        <div className={s.headerInfo}>
          <h2 className={s.headerTitle}>Картотека</h2>
          <p className={s.headerText}>Типы карт для онлайн-партии</p>
        </div>
      </header>

      <main className={s.main}>
        <Swiper
          className={s.swiper}
          modules={[EffectCoverflow]}
          effect="coverflow"
          grabCursor
          centeredSlides
          slidesPerView="auto"
          spaceBetween={12}
          speed={400}
          initialSlide={CARD_COUNT}
          coverflowEffect={{
            rotate: 32,
            stretch: 0,
            depth: 140,
            modifier: 1.35,
            slideShadows: false,
          }}
          onSwiper={(swiper) => {
            swiperRef.current = swiper
          }}
          onSlideChangeTransitionEnd={fixLoopPosition}
        >
          {slides.map((cardId, index) => (
            <SwiperSlide key={`${cardId}-${index}`} className={s.slide}>
              <img
                className={s.cardImage}
                src={getCardImageUrl(cardId)}
                alt={cardId}
                loading="lazy"
              />
            </SwiperSlide>
          ))}
        </Swiper>
      </main>
    </>
  )
}
