# Sound Files

This directory should contain notification sound files in WAV format:

- `message.wav` - New message notification sound
- `incoming-call.wav` - Incoming call notification sound  
- `call-ended.wav` - Call ended notification sound

## Generating Simple Notification Sounds

You can create simple notification sounds using `ffmpeg`:

```bash
# Generate a simple beep sound (440Hz, 0.5 seconds)
ffmpeg -f lavfi -i "sine=frequency=440:duration=0.5" -ar 44100 message.wav

# Generate a ringing sound (alternating tones)
ffmpeg -f lavfi -i "sine=frequency=480:duration=0.2" -ar 44100 -af "aloop=loop=5:size=8820" incoming-call.wav

# Generate a click sound
ffmpeg -f lavfi -i "sine=frequency=800:duration=0.1" -ar 44100 call-ended.wav
```

Or download free notification sounds from:
- https://notificationsounds.com/
- https://freesound.org/
- https://mixkit.co/free-sound-effects/notification/

Make sure the files are in WAV format for best compatibility.
