# Security headers for every response nginx serves (the SPA itself is not
# behind the API's helmet middleware). Included at server level AND inside
# every location that declares its own add_header, because nginx does not
# inherit add_header into a location that defines one.
add_header X-Frame-Options "SAMEORIGIN" always;
add_header Content-Security-Policy "frame-ancestors 'self'" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
