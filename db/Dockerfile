FROM postgres:16-alpine

COPY dev-entrypoint.sh /usr/local/bin/dev-entrypoint.sh

RUN chmod +x /usr/local/bin/dev-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/dev-entrypoint.sh"]
CMD ["postgres"]
