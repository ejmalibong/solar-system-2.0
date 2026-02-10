uniform sampler2D uDayTexture;
uniform sampler2D uNightTexture;
uniform sampler2D uCloudTexture;
uniform vec3 uSunDirection;
uniform float uCloudOffset;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPosition;

void main()
{
    vec3 viewDirection = normalize(vPosition - cameraPosition);
    vec3 normal = normalize(vNormal);

    float sunOrientation = dot(-uSunDirection, normal);
    float dayMix = smoothstep(-0.25, 0.5, sunOrientation);

    vec3 dayColor = texture2D(uDayTexture, vUv).rgb;
    vec3 nightColor = texture2D(uNightTexture, vUv).rgb;

    vec3 color = mix(nightColor, dayColor, dayMix);

    vec2 cloudUv = vUv + vec2(uCloudOffset, 0.0);

    // Clouds
    float cloud = texture2D(uCloudTexture, cloudUv).r; // white = cloud

    float dayCloud   = cloud * dayMix;
    float nightCloud = cloud * (1.0 - dayMix);

    // Day: white clouds
    color = mix(color, vec3(1.0), dayCloud * 0.35);

    // Night: faint shadow clouds
    color = mix(color, color * 0.9, nightCloud * 0.05);

    gl_FragColor = vec4(color, 1.0);
}
