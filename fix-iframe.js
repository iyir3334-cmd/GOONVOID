// Quick fix script - adds conditional iframe rendering
const fs = require('fs');
const path = 'e:\\VOid\\web-video-finder\\components\\VerticalFeed.tsx';
let content = fs.readFileSync(path, 'utf8');

// Replace the iframe block with conditional rendering
const original = `                                        isEmbed ? (
                                            <iframe
                                                src={streamUrl}
                                                className="w-full h-full"
                                                allow="autoplay; fullscreen; picture-in-picture"
                                                allowFullScreen
                                                style={{ border: 'none' }}
                                                onError={(e) => console.log("Iframe load error", e)}  
                                            />`;

const replacement = `                                        isEmbed ? (
                                            playingId === key ? (
                                                <iframe
                                                    src={streamUrl}
                                                    className="w-full h-full"
                                                    allow="autoplay; fullscreen; picture-in-picture"
                                                    allowFullScreen
                                                    style={{ border: 'none' }}
                                                    onError={(e) => console.log("Iframe load error", e)}  
                                                />
                                            ) : (
                                                <div 
                                                    className="w-full h-full flex items-center justify-center bg-black cursor-pointer"
                                                    style={{ 
                                                        backgroundImage: vid.thumbnailUrl ? \`url(\${vid.thumbnailUrl})\` : 'none',
                                                        backgroundSize: 'contain',
                                                        backgroundPosition: 'center',
                                                        backgroundRepeat: 'no-repeat'
                                                    }}
                                                >
                                                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                                                        <PlayIcon />
                                                    </div>
                                                </div>
                                            )`;

content = content.replace(original, replacement);
fs.writeFileSync(path, content);
console.log('Fixed VerticalFeed.tsx');
