import { Hono } from 'hono'
import { Env } from '../types'

const inquiryRoutes = new Hono<{ Bindings: Env }>()

// 문의 등록
inquiryRoutes.post('/', async (c) => {
  try {
    const { name, email, phone, inquiry_type, subject, message } = await c.req.json()
    
    if (!name || !email || !subject || !message) {
      return c.json({ error: '필수 정보를 모두 입력해주세요.' }, 400)
    }
    
    await c.env.DB.prepare(`
      INSERT INTO inquiries (name, email, phone, inquiry_type, subject, message)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(name, email, phone || null, inquiry_type || 'general', subject, message).run()
    
    return c.json({
      success: true,
      message: '문의가 등록되었습니다. 빠른 시일 내에 답변 드리겠습니다.'
    })
  } catch (e) {
    return c.json({ error: '문의 등록 중 오류가 발생했습니다.' }, 500)
  }
})

export default inquiryRoutes
