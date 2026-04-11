import * as THREE from 'three';

export class AirKeyboard extends THREE.Group {
    constructor(onKey) {
        super();
        this.onKey = onKey;
        this.keys = [];
        this.layout = [
            ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
            ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '⌫'],
            ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Enter'],
            ['Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.'],
            ['Close', ' ']//space
        ];
        this.createKeyboard();
    }

    createKeyboard() {
        const keyHeight = 0.08;
        const keyWidthBase = 0.07;
        const spacing = 0.012;
        
        let yOffset = 0;
        this.layout.forEach((row, rowIndex) => {
            const rowWidth = row.reduce((acc, label) => acc + this.getKeyWidth(label, keyWidthBase) + spacing, -spacing);
            let xOffset = -rowWidth / 2 + (this.getKeyWidth(row[0], keyWidthBase) / 2);

            row.forEach(keyLabel => {
                const kWidth = this.getKeyWidth(keyLabel, keyWidthBase);
                const key = this.createKey(keyLabel, kWidth, keyHeight);
                key.position.set(xOffset, -yOffset, 0);
                this.add(key);
                this.keys.push(key);

                const nextKey = row[row.indexOf(keyLabel) + 1];
                if (nextKey) {
                    xOffset += (kWidth / 2) + spacing + (this.getKeyWidth(nextKey, keyWidthBase) / 2);
                }
            });
            yOffset += keyHeight + spacing;
        });

        // Add a premium glass backplate - Use Box for better VR intersection
        const plateWidth = 10 * (keyWidthBase + spacing) + 0.08;
        const plateHeight = yOffset + 0.08;
        const plate = new THREE.Mesh(
            new THREE.BoxGeometry(plateWidth, plateHeight, 0.01),
            new THREE.MeshStandardMaterial({ 
                color: 0x0a1423, 
                transparent: true, 
                opacity: 0.9, 
                metalness: 0, 
                roughness: 1,
                side: THREE.DoubleSide
            })
        );
        plate.position.set(0, -(yOffset - keyHeight) / 2, -0.01);
        this.add(plate);

        // Header light
        const header = new THREE.Mesh(
            new THREE.PlaneGeometry(plateWidth, 0.005),
            new THREE.MeshBasicMaterial({ color: 0x00f2ff, transparent: true, opacity: 0.5 })
        );
        header.position.set(0, plateHeight/2 - (yOffset-keyHeight)/2 - 0.04, 0.001);
        this.add(header);
    }

    getKeyWidth(label, base) {
        if (label === ' ') return base * 8;
        if (label === 'Enter' || label === 'Close') return base * 1.8;
        if (label === '⌫') return base * 1.2;
        return base;
    }

    createKey(label, width, height) {
        const group = new THREE.Group();
        
        // High Quality Key Canvas for better aesthetics
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');

        const drawKey = (hover = false) => {
            ctx.clearRect(0, 0, 256, 256);
            
            // Rounded background
            const r = 32;
            ctx.beginPath();
            ctx.moveTo(r, 0);
            ctx.lineTo(256-r, 0);
            ctx.quadraticCurveTo(256, 0, 256, r);
            ctx.lineTo(256, 256-r);
            ctx.quadraticCurveTo(256, 256, 256-r, 256);
            ctx.lineTo(r, 256);
            ctx.quadraticCurveTo(0, 256, 0, 256-r);
            ctx.lineTo(0, r);
            ctx.quadraticCurveTo(0, 0, r, 0);
            ctx.closePath();
            
            // Fill
            const grad = ctx.createLinearGradient(0, 0, 0, 256);
            if (hover) {
                grad.addColorStop(0, 'rgba(0, 242, 255, 0.4)');
                grad.addColorStop(1, 'rgba(0, 119, 255, 0.2)');
            } else {
                grad.addColorStop(0, 'rgba(255, 255, 255, 0.05)');
                grad.addColorStop(1, 'rgba(255, 255, 255, 0.02)');
            }
            ctx.fillStyle = grad;
            ctx.fill();

            // Border
            ctx.strokeStyle = hover ? '#00f2ff' : 'rgba(255, 255, 255, 0.2)';
            ctx.lineWidth = 8;
            ctx.stroke();

            // Text
            ctx.fillStyle = hover ? '#fff' : '#00f2ff';
            ctx.font = 'bold 80px "Outfit", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowBlur = hover ? 15 : 0;
            ctx.shadowColor = '#00f2ff';
            ctx.fillText(label, 128, 128);
        };

        drawKey(false);
        const tex = new THREE.CanvasTexture(canvas);
        const mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(width, height),
            new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide })
        );
        group.add(mesh);

        group.userData = { label, mesh, canvas, ctx, drawKey, tex };
        return group;
    }

    onHover(intersectedLabel) {
        this.keys.forEach(k => {
            const isTarget = k.userData.label === intersectedLabel;
            if (k.userData.isHovered !== isTarget) {
                k.userData.isHovered = isTarget;
                k.userData.drawKey(isTarget);
                k.userData.tex.needsUpdate = true;
            }
        });
    }

    press(label) {
        let keyChar = label;
        if (label === '⌫') keyChar = 'Backspace';
        if (label === ' ') keyChar = ' ';
        this.onKey(keyChar);

        // Visual feedback
        const key = this.keys.find(k => k.userData.label === label);
        if (key) {
            key.position.z = -0.01;
            setTimeout(() => key.position.z = 0, 100);
        }
    }
}
