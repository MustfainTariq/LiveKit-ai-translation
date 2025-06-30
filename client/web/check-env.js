#!/usr/bin/env node

// Simple script to check LiveKit environment configuration
const fs = require('fs');
const path = require('path');

console.log('🔍 LiveKit Environment Configuration Check\n');

// Check if .env.local exists
const envLocalPath = path.join(__dirname, '.env.local');
const envLocalExists = fs.existsSync(envLocalPath);

console.log(`📁 .env.local file: ${envLocalExists ? '✅ EXISTS' : '❌ MISSING'}`);

if (!envLocalExists) {
  console.log('\n❌ CRITICAL: .env.local file is missing!');
  console.log('\n🔧 Create it with:');
  console.log('```');
  console.log('NEXT_PUBLIC_LIVEKIT_URL=wss://your-project.livekit.cloud');
  console.log('LIVEKIT_API_KEY=your_api_key');
  console.log('LIVEKIT_API_SECRET=your_api_secret');
  console.log('```');
  process.exit(1);
}

// Read and check .env.local content
try {
  const envContent = fs.readFileSync(envLocalPath, 'utf8');
  const lines = envContent.split('\n').filter(line => line.trim() && !line.startsWith('#'));
  
  const config = {};
  lines.forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) {
      config[key.trim()] = value.trim();
    }
  });

  console.log('\n📋 Environment Variables:');
  
  // Check NEXT_PUBLIC_LIVEKIT_URL
  const url = config['NEXT_PUBLIC_LIVEKIT_URL'];
  if (!url) {
    console.log('❌ NEXT_PUBLIC_LIVEKIT_URL: MISSING');
  } else if (!url.startsWith('wss://')) {
    console.log(`❌ NEXT_PUBLIC_LIVEKIT_URL: Invalid format (${url})`);
    console.log('   Should start with wss://');
  } else {
    console.log(`✅ NEXT_PUBLIC_LIVEKIT_URL: ${url}`);
  }

  // Check API key
  const apiKey = config['LIVEKIT_API_KEY'];
  if (!apiKey) {
    console.log('❌ LIVEKIT_API_KEY: MISSING');
  } else {
    console.log(`✅ LIVEKIT_API_KEY: ${apiKey.substring(0, 8)}...`);
  }

  // Check API secret
  const apiSecret = config['LIVEKIT_API_SECRET'];
  if (!apiSecret) {
    console.log('❌ LIVEKIT_API_SECRET: MISSING');
  } else {
    console.log(`✅ LIVEKIT_API_SECRET: ${apiSecret.substring(0, 8)}...`);
  }

  // Check server .env file
  console.log('\n🖥️  Server Configuration:');
  const serverEnvPath = path.join(__dirname, '../../server/.env');
  const serverEnvExists = fs.existsSync(serverEnvPath);
  
  if (!serverEnvExists) {
    console.log('❌ server/.env: MISSING');
  } else {
    console.log('✅ server/.env: EXISTS');
    // Could add more checks here
  }

  console.log('\n🚀 Next Steps:');
  console.log('1. Make sure server/.env has the SAME credentials');
  console.log('2. Restart both server and client');
  console.log('3. Check browser console for connection logs');

} catch (error) {
  console.error('❌ Error reading .env.local:', error.message);
} 