# Deployment Guide

## 🚀 Quick Deploy to Render.com

This guide walks you through deploying the Bitespeed Identity Reconciliation Service to Render.com's free tier.

### Prerequisites

1. **GitHub Account** with your code repository
2. **Render.com Account** (free tier available)
3. **Local Development** setup working

### Step 1: Prepare Your Repository

1. **Ensure all files are committed**
   ```bash
   git add .
   git commit -m "feat: prepare for deployment"
   git push origin main
   ```

2. **Run deployment checks**
   ```bash
   npm run deploy:check
   ```

### Step 2: Create PostgreSQL Database

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **"New +"** → **"PostgreSQL"**
3. Configure database:
   - **Name:** `bitespeed-postgres`
   - **Database Name:** `bitespeed_identity`
   - **User:** `bitespeed`
   - **Region:** Choose closest to your users
   - **Plan:** Free (sufficient for development/testing)
4. Click **"Create Database"**
5. **Save the connection details** (you'll need the internal connection string)

### Step 3: Create Web Service

1. Click **"New +"** → **"Web Service"**
2. **Connect Repository:**
   - Choose "Build and deploy from a Git repository"
   - Connect your GitHub account
   - Select your repository
   - Choose branch: `main`

3. **Configure Service:**
   - **Name:** `bitespeed-identity-service`
   - **Runtime:** `Node`
   - **Region:** Same as your database
   - **Branch:** `main`
   - **Build Command:** 
     ```bash
     npm ci && npm run build && npx prisma generate && npx prisma db push
     ```
   - **Start Command:** 
     ```bash
     npm start
     ```

### Step 4: Environment Variables

Set these environment variables in Render dashboard:

**Required Variables:**
```bash
NODE_ENV=production
PORT=10000
DATABASE_URL=[Connect to your PostgreSQL database]
```

**Recommended Variables:**
```bash
LOG_LEVEL=INFO
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_IDENTIFY_MAX=10
MAX_CONTACTS_PER_OPERATION=1000
ENABLE_ENHANCED_VALIDATION=true
ENABLE_BUSINESS_RULES=true
REQUEST_TIMEOUT_MS=30000
```

**Security Variables (Optional but Recommended):**
```bash
API_KEY=your-secure-api-key-min-32-chars
CORS_ORIGINS=https://your-app-name.onrender.com
```

### Step 5: Connect Database

1. In the **Environment** section of your web service
2. For `DATABASE_URL`:
   - Click "Connect Database"
   - Select your PostgreSQL database
   - This will auto-populate the connection string

### Step 6: Deploy

1. Click **"Create Web Service"**
2. Monitor the **deployment logs**
3. Wait for "Your service is live" message
4. Note your service URL: `https://your-app-name.onrender.com`

## 🧪 Post-Deployment Testing

### 1. Health Check
```bash
curl https://your-app-name.onrender.com/health
```

**Expected Response:**
```json
{
  "status": "healthy",
  "timestamp": "2023-04-20T10:30:00.000Z",
  "environment": "production",
  "database": "connected"
}
```

### 2. Test Identify Endpoint
```bash
curl -X POST https://your-app-name.onrender.com/identify \
  -H "Content-Type: application/json" \
  -d '{"email": "lorraine@hillvalley.edu", "phoneNumber": "123456"}'
```

**Expected Response:**
```json
{
  "contact": {
    "primaryContactId": 1,
    "emails": ["lorraine@hillvalley.edu"],
    "phoneNumbers": ["123456"],
    "secondaryContactIds": []
  }
}
```

### 3. Test Contact Linking
```bash
curl -X POST https://your-app-name.onrender.com/identify \
  -H "Content-Type: application/json" \
  -d '{"email": "mcfly@hillvalley.edu", "phoneNumber": "123456"}'
```

## 🔧 Troubleshooting

### Common Issues

**Build Failures:**
- Check Node.js version in logs (should be 18+)
- Ensure all dependencies are in `package.json`
- Verify TypeScript compilation succeeds locally

**Database Connection Issues:**
- Verify `DATABASE_URL` is correctly set
- Check database is in the same region
- Ensure database is not sleeping (free tier limitation)

**Application Not Starting:**
- Check start command: `npm start`
- Verify `dist/app.js` exists after build
- Review application logs for errors

**Performance Issues:**
- Free tier has resource limitations
- Cold starts are normal (10-15 seconds)
- Consider upgrading to paid tier for production

### Viewing Logs

1. Go to your service dashboard
2. Click on **"Logs"** tab
3. Monitor real-time logs during deployment and runtime

### Database Management

**Connect to database:**
```bash
# Use the external connection string from Render dashboard
psql [EXTERNAL_DATABASE_URL]
```

**Run migrations manually (if needed):**
```bash
# In your local environment, connected to production DB
DATABASE_URL=[EXTERNAL_DATABASE_URL] npx prisma migrate deploy
```

## 📊 Monitoring

### Health Monitoring
- **Endpoint:** `/health`
- **Frequency:** Monitor every 5 minutes
- **Alerts:** Set up alerts for non-200 responses

### Performance Monitoring
- **Response Times:** Monitor API response times
- **Error Rates:** Track 4xx and 5xx responses
- **Database Performance:** Monitor connection pool usage

### Render Monitoring Features
- **Metrics Dashboard:** Built-in CPU, memory, and request metrics
- **Alerts:** Set up alerts for service downtime
- **Logs:** Real-time log viewing and searching

## 🔄 Continuous Deployment

### Automatic Deployments
1. In service settings, enable **"Auto-Deploy"**
2. Choose branch: `main`
3. Every push to main will trigger deployment

### Manual Deployments
1. Go to service dashboard
2. Click **"Manual Deploy"**
3. Select branch and deploy

### Deployment Best Practices
1. **Test locally** before pushing
2. **Run tests** in CI/CD pipeline
3. **Monitor deployment** logs
4. **Test endpoints** after deployment
5. **Rollback** if issues detected

## 💰 Cost Optimization

### Free Tier Limitations
- **Web Service:** 512MB RAM, shared CPU
- **Database:** 1GB storage, 100 connections
- **Bandwidth:** 100GB/month
- **Sleep:** Services sleep after 15 minutes of inactivity

### Upgrade Considerations
- **Paid Web Service:** Dedicated resources, no sleep
- **Paid Database:** More storage, better performance
- **Custom Domains:** Available on paid plans

## 🛡️ Security Considerations

### Production Security Checklist
- [ ] API_KEY configured (if using authentication)
- [ ] CORS_ORIGINS properly configured
- [ ] Rate limiting enabled
- [ ] Input validation active
- [ ] HTTPS enforced (automatic on Render)
- [ ] Database credentials secure
- [ ] Environment variables not exposed in logs

### Security Best Practices
1. **Never commit secrets** to repository
2. **Use environment variables** for all configuration
3. **Enable API key authentication** for production
4. **Monitor access logs** for suspicious activity
5. **Keep dependencies updated**

## 📈 Scaling

### Horizontal Scaling
- **Multiple Instances:** Available on paid plans
- **Load Balancing:** Automatic load balancing
- **Auto-scaling:** Scale based on CPU/memory usage

### Vertical Scaling
- **Upgrade Plan:** More CPU and memory
- **Database Scaling:** Larger database instances
- **Performance Monitoring:** Monitor and scale based on metrics

---

## 🆘 Support

If you encounter issues:

1. **Check Render Status:** [status.render.com](https://status.render.com)
2. **Review Documentation:** [render.com/docs](https://render.com/docs)
3. **Community Support:** [community.render.com](https://community.render.com)
4. **Contact Support:** support@render.com (paid plans)

For application-specific issues, check the application logs and ensure your local environment works correctly first.

---

**Happy Deploying! 🚀**