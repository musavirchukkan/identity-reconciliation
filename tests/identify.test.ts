import request from 'supertest';
import app from '../src/app';

describe('POST /identify', () => {
  it('should create a new primary contact when no existing contacts found', async () => {
    const response = await request(app)
      .post('/identify')
      .send({
        email: 'test@example.com',
        phoneNumber: '1234567890'
      })
      .expect(200);

    expect(response.body.contact).toHaveProperty('primaryContactId');
    expect(response.body.contact.emails).toContain('test@example.com');
    expect(response.body.contact.phoneNumbers).toContain('1234567890');
    expect(response.body.contact.secondaryContactIds).toEqual([]);
  });

  it('should return validation error when neither email nor phone provided', async () => {
    await request(app)
      .post('/identify')
      .send({})
      .expect(400);
  });

  it('should return validation error for invalid email', async () => {
    await request(app)
      .post('/identify')
      .send({
        email: 'invalid-email',
        phoneNumber: '1234567890'
      })
      .expect(400);
  });
});

describe('GET /health', () => {
  it('should return health status', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);

    expect(response.body.status).toBe('healthy');
    expect(response.body.service).toBe('identity-reconciliation');
  });
}); 