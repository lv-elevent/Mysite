// 模块 4：联系方式。
//
// 数据来源：吕国庆个人简历（2026-09 版）。
// 三项都可直接点开：tel: / mailto: / https: —— 手机上点电话就是拨号，不用手动复制。
// 二维码用 scripts/crop-qr.py 从微信原图裁出的码体（public/images/qr.png）：
// 只保留二维码本身，原图里的头像、昵称和地区都被裁掉了，避免不必要的个人信息暴露。

import { CONTACT_ICONS } from '../ui/ContactIcons'

interface ContactItem {
  id: string
  label: string
  value: string
  href: string
  /** 站外链接需要新开页 + noopener */
  external?: boolean
}

const CONTACTS: readonly ContactItem[] = [
  { id: 'phone', label: '电话', value: '17790638451', href: 'tel:17790638451' },
  { id: 'email', label: '邮箱', value: 'curry7734@126.com', href: 'mailto:curry7734@126.com' },
  {
    id: 'github',
    label: 'GitHub',
    value: 'github.com/lv-elevent',
    href: 'https://github.com/lv-elevent',
    external: true,
  },
] as const

export default function ContactPanel() {
  return (
    <div className="panel-stack">
      <section className="panel-block">
        <h3 className="panel-block-title">求职意向</h3>
        <p className="panel-text">
          AI Agent / AI 应用开发方向，可实习、可全职。如果下面的项目经历和你在做的事有交集，欢迎直接联系。
        </p>
      </section>

      <section className="panel-block">
        <h3 className="panel-block-title">找到我</h3>
        <div className="panel-contacts">
          {CONTACTS.map((c) => {
            const Icon = CONTACT_ICONS[c.id]
            return (
              <a
                key={c.id}
                className="panel-contact"
                href={c.href}
                {...(c.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              >
                <span className="panel-contact-icon" aria-hidden="true">
                  <Icon />
                </span>
                <span className="panel-contact-text">
                  <span className="panel-contact-label">{c.label}</span>
                  <span className="panel-contact-value">{c.value}</span>
                </span>
                <span className="panel-contact-arrow" aria-hidden="true">
                  ↗
                </span>
              </a>
            )
          })}
        </div>
      </section>

      <section className="panel-block">
        <h3 className="panel-block-title">二维码</h3>
        <div className="panel-qr">
          <div className="panel-qr-frame">
            <img
              className="panel-qr-img"
              src={`${import.meta.env.BASE_URL}images/qr.png`}
              alt="微信二维码，扫码添加好友"
              width={140}
              height={140}
              loading="lazy"
            />
          </div>
          <p className="panel-note">
            微信扫码加好友。个人二维码有有效期，如果扫不出来，
            直接走上面的电话或邮箱更快。
          </p>
        </div>
      </section>
    </div>
  )
}
