#!/bin/sh

# Install ffmpeg from https://www.ffmpeg.org/download.html
# Install piper from https://github.com/rhasspy/piper

# Download two files per voice from https://github.com/rhasspy/piper/blob/master/VOICES.md

# A .onnx model file, such as en_US-lessac-medium.onnx
# A .onnx.json config file, such as en_US-lessac-medium.onnx.json


#model="en_US-lessac-medium.onnx"
#model="en_US-amy-medium.onnx"
model="en_GB-northern_english_male-medium.onnx"

MP3BITRATE="196k"
OGGBITRATE="32k"

for word in 'pawn' 'knight' 'bishop' 'rook' 'queen' 'horse' 'elephant' 'chariot' 'cannon' 'advisor'
do
no_word="no '$word'"

echo "$word" | ./piper   --model "$model"   --output_file "$word".wav
ffmpeg -i "$word".wav -acodec libmp3lame -b:a "$MP3BITRATE" "$word".mp3
ffmpeg -i "$word".wav -acodec libvorbis -b:a "$OGGBITRATE" "$word".ogg

echo "$no_word" | ./piper   --model "$model"   --output_file no-"$word".wav
ffmpeg -i no-"$word".wav -acodec libmp3lame -b:a "$MP3BITRATE" no-"$word".mp3
ffmpeg -i no-"$word".wav -acodec libvorbis -b:a "$OGGBITRATE" no-"$word".ogg

done

for word in 'sit' 'go' 'trade' 'checkmate' 'ok' 'no' 'nevermind' 'nice'
do
echo "$word" | ./piper   --model "$model"   --output_file "$word".wav
ffmpeg -i "$word".wav -acodec libmp3lame -b:a "$MP3BITRATE" "$word".mp3
ffmpeg -i "$word".wav -acodec libvorbis -b:a "$OGGBITRATE" "$word".ogg
done

word="dont-trade"
echo "don't trade" | ./piper   --model "$model"   --output_file "$word".wav
ffmpeg -i "$word".wav -acodec libmp3lame -b:a "$MP3BITRATE" "$word".mp3
ffmpeg -i "$word".wav -acodec libvorbis -b:a "$OGGBITRATE" "$word".ogg

word="my-bad"
echo "my bad" | ./piper   --model "$model"   --output_file "$word".wav
ffmpeg -i "$word".wav -acodec libmp3lame -b:a "$MP3BITRATE" "$word".mp3
ffmpeg -i "$word".wav -acodec libvorbis -b:a "$OGGBITRATE" "$word".ogg
