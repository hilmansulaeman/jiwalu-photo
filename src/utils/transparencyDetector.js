export async function detectTransparentHoles(imageUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      const width = canvas.width;
      const height = canvas.height;
      const visited = new Uint8Array(width * height);
      const boundingBoxes = [];
      
      const getPixelIndex = (x, y) => (y * width + x) * 4;
      const isTransparent = (x, y) => {
        if (x < 0 || x >= width || y < 0 || y >= height) return false;
        const alpha = data[getPixelIndex(x, y) + 3];
        return alpha < 50; // Threshold for transparency
      };

      // Simple BFS to find contiguous transparent regions (holes)
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x;
          if (!visited[idx] && isTransparent(x, y)) {
            // Found a new hole
            let minX = x;
            let maxX = x;
            let minY = y;
            let maxY = y;
            
            const queue = [[x, y]];
            visited[idx] = 1;
            
            let area = 0;
            
            while (queue.length > 0) {
              const [cx, cy] = queue.shift();
              area++;
              
              if (cx < minX) minX = cx;
              if (cx > maxX) maxX = cx;
              if (cy < minY) minY = cy;
              if (cy > maxY) maxY = cy;
              
              // Check neighbors
              const neighbors = [
                [cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]
              ];
              
              for (const [nx, ny] of neighbors) {
                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                  const nIdx = ny * width + nx;
                  if (!visited[nIdx] && isTransparent(nx, ny)) {
                    visited[nIdx] = 1;
                    queue.push([nx, ny]);
                  }
                }
              }
            }
            
            // Only consider it a slot if it's large enough (e.g. > 100x100 pixels)
            // This prevents tiny anti-aliasing artifacts from being detected as slots.
            if (maxX - minX > 50 && maxY - minY > 50) {
              boundingBoxes.push({
                x: minX,
                y: minY,
                width: maxX - minX,
                height: maxY - minY
              });
            }
          } else {
            visited[idx] = 1; // Mark opaque pixels as visited
          }
        }
      }
      
      resolve(boundingBoxes);
    };
    img.onerror = () => reject(new Error('Failed to load image for transparency detection'));
    img.src = imageUrl;
  });
}
