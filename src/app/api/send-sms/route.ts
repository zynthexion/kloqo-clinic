
import { NextRequest, NextResponse } from 'next/server';
import twilio from 'twilio';

export async function POST(request: NextRequest) {
  const { to, message } = await request.json();

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;

  // Check if Twilio credentials are configured in .env
  if (!accountSid || !authToken || !from) {
    console.error("Twilio credentials are not configured in .env file.");
    return NextResponse.json(
      { success: false, error: 'SMS service is not configured. Please contact support.' },
      { status: 500 }
    );
  }
  
  // Check for placeholder credentials
  if (accountSid === 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' || authToken === 'your_auth_token') {
    console.warn("Using placeholder Twilio credentials. SMS will not be sent.");
    // Simulate a successful response for development/testing without real credentials
    return NextResponse.json({ success: true, message: "SMS sending is in simulation mode." });
  }

  const client = twilio(accountSid, authToken);

  try {
    const result = await client.messages.create({
      body: message,
      from,
      to,
    });

    console.log('Twilio message sent successfully:', result.sid);
    return NextResponse.json({ success: true, sid: result.sid });
  } catch (error: any) {
    console.error('Twilio error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to send SMS via Twilio.' },
      { status: 500 }
    );
  }
}
