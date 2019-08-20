"""OAuth support for Aiohttp lib."""

import asyncio
import base64
import hmac
import logging
import time
from hashlib import sha1
from random import SystemRandom
from urllib.parse import parse_qsl, quote, urlencode, urljoin, urlsplit

import aiohttp
import yarl
from aiohttp import BasicAuth, web


__version__ = "0.17.3"
__project__ = "aioauth-client"
__author__ = "Kirill Klenov <horneds@gmail.com>"
__license__ = "MIT"


RANDOM = SystemRandom().random


class User:
    """Store user's information."""

    __slots__ = 'id', 'email', 'first_name', 'last_name', 'username', 'picture', \
        'link', 'locale', 'city', 'country', 'gender'

    def __init__(self, **info):
        """Initialize self data."""
        for attr in self.__slots__:
            setattr(self, attr, info.get(attr))


class Signature(object):
    """Abstract base class for signature methods."""

    name = None

    @staticmethod
    def _escape(s):
        """URL escape a string."""
        bs = s.encode('utf-8')
        return quote(bs, '~').encode('utf-8')

    def sign(self, consumer_secret, method, url, oauth_token_secret=None,
             **params):
        """Abstract method."""
        raise NotImplementedError('Shouldnt be called.')


class HmacSha1Signature(Signature):
    """HMAC-SHA1 signature-method."""

    name = 'HMAC-SHA1'

    def sign(self, consumer_secret, method, url, oauth_token_secret=None,
             **params):
        """Create a signature using HMAC-SHA1."""
        # build the url the same way aiohttp will build the query later on
        # cf https://github.com/KeepSafe/aiohttp/blob/master/aiohttp/client.py#L151
        # and https://github.com/KeepSafe/aiohttp/blob/master/aiohttp/client_reqrep.py#L81
        url = yarl.URL(url).with_query(sorted(params.items()))
        url, params = str(url).split('?', 1)
        method = method.upper()

        signature = b"&".join(map(self._escape, (method, url, params)))

        key = self._escape(consumer_secret) + b"&"
        if oauth_token_secret:
            key += self._escape(oauth_token_secret)

        hashed = hmac.new(key, signature, sha1)
        return base64.b64encode(hashed.digest()).decode()


class PlaintextSignature(Signature):
    """PLAINTEXT signature-method."""

    name = 'PLAINTEXT'

    def sign(self, consumer_secret, method, url, oauth_token_secret=None,
             **params):
        """Create a signature using PLAINTEXT."""
        key = self._escape(consumer_secret) + b'&'
        if oauth_token_secret:
            key += self._escape(oauth_token_secret)
        return key.decode()


class ClientRegistry(type):
    """Meta class to register OAUTH clients."""

    clients = {}

    def __new__(mcs, name, bases, params):
        """Save created client in self registry."""
        cls = super().__new__(mcs, name, bases, params)
        mcs.clients[cls.name] = cls
        return cls


class Client(object, metaclass=ClientRegistry):
    """Base abstract OAuth Client class."""

    access_token_key = 'access_token'
    shared_key = 'oauth_verifier'
    access_token_url = None
    authorize_url = None
    base_url = None
    name = None
    user_info_url = None

    def __init__(self, base_url=None, authorize_url=None, access_token_key=None,
                 access_token_url=None, session=None, logger=None):
        """Initialize the client."""
        self.base_url = base_url or self.base_url
        self.authorize_url = authorize_url or self.authorize_url
        self.access_token_key = access_token_key or self.access_token_key
        self.access_token_url = access_token_url or self.access_token_url
        self.logger = logger or logging.getLogger('OAuth: %s' % self.name)
        self.session = session

    def _get_url(self, url):
        """Build provider's url. Join with base_url part if needed."""
        if self.base_url and not url.startswith(('http://', 'https://')):
            return urljoin(self.base_url, url)
        return url

    def __str__(self):
        """String representation."""
        return "%s %s" % (self.name.title(), self.base_url)

    def __repr__(self):
        """String representation."""
        return "<%s>" % self

    async def _request(self, method, url, loop=None, timeout=None, **kwargs):
        """Make a request through AIOHTTP."""
        session = self.session or aiohttp.ClientSession(
            loop=loop, conn_timeout=timeout, read_timeout=timeout)
        try:
            async with session.request(method, url, **kwargs) as response:

                if response.status / 100 > 2:
                    raise web.HTTPBadRequest(
                        reason='HTTP status code: %s' % response.status)

                if 'json' in response.headers.get('CONTENT-TYPE'):
                    data = await response.json()
                else:
                    data = await response.text()
                    data = dict(parse_qsl(data))

                return data

        except asyncio.TimeoutError:
            raise web.HTTPBadRequest(reason='HTTP Timeout')

        finally:
            if not self.session and not session.closed:
                await session.close()

    def request(self, method, url, params=None, headers=None, loop=None,
                **aio_kwargs):
        """Make a request to provider."""
        raise NotImplementedError('Shouldnt be called.')

    async def user_info(self, loop=None, **kwargs):
        """Load user information from provider."""
        if not self.user_info_url:
            raise NotImplementedError(
                'The provider doesnt support user_info method.')

        data = await self.request('GET', self.user_info_url, loop=loop, **kwargs)
        user = User(**dict(self.user_parse(data)))
        return user, data

    @staticmethod
    def user_parse(data):
        """Parse user's information from given provider data."""
        yield 'id', None


class OAuth1Client(Client):
    """Implement OAuth1."""

    name = 'oauth1'
    access_token_key = 'oauth_token'
    request_token_url = None
    version = '1.0'

    def __init__(self, consumer_key, consumer_secret, base_url=None,
                 authorize_url=None,
                 oauth_token=None, oauth_token_secret=None,
                 request_token_url=None,
                 access_token_url=None, access_token_key=None, session=None, logger=None,
                 signature=None,
                 **params):
        """Initialize the client."""
        super().__init__(base_url, authorize_url, access_token_key,
                         access_token_url, session, logger)

        self.oauth_token = oauth_token
        self.oauth_token_secret = oauth_token_secret
        self.consumer_key = consumer_key
        self.consumer_secret = consumer_secret
        self.request_token_url = request_token_url or self.request_token_url
        self.params = params
        self.signature = signature or HmacSha1Signature()

    def get_authorize_url(self, request_token=None, **params):
        """Return formatted authorization URL."""
        params.update({'oauth_token': request_token or self.oauth_token})
        return self.authorize_url + '?' + urlencode(params)

    def request(self, method, url, params=None, **aio_kwargs):
        """Make a request to provider."""
        oparams = {
            'oauth_consumer_key': self.consumer_key,
            'oauth_nonce': sha1(str(RANDOM()).encode('ascii')).hexdigest(),
            'oauth_signature_method': self.signature.name,
            'oauth_timestamp': str(int(time.time())),
            'oauth_version': self.version,
        }
        oparams.update(params or {})

        if self.oauth_token:
            oparams['oauth_token'] = self.oauth_token

        url = self._get_url(url)

        if urlsplit(url).query:
            raise ValueError(
                'Request parameters should be in the "params" parameter, '
                'not inlined in the URL')

        oparams['oauth_signature'] = self.signature.sign(
            self.consumer_secret, method, url,
            oauth_token_secret=self.oauth_token_secret, **oparams)
        self.logger.debug("%s %s", url, oparams)

        return self._request(method, url, params=oparams, **aio_kwargs)

    async def get_request_token(self, loop=None, **params):
        """Get a request_token and request_token_secret from OAuth1 provider."""
        params = dict(self.params, **params)
        data = await self.request('GET', self.request_token_url, params=params, loop=loop)

        self.oauth_token = data.get('oauth_token')
        self.oauth_token_secret = data.get('oauth_token_secret')
        return self.oauth_token, self.oauth_token_secret, data

    async def get_access_token(self, oauth_verifier, request_token=None, loop=None, **params):
        """Get access_token from OAuth1 provider.

        :returns: (access_token, access_token_secret, provider_data)
        """
        # Possibility to provide REQUEST DATA to the method
        if not isinstance(oauth_verifier, str) and self.shared_key in oauth_verifier:
            oauth_verifier = oauth_verifier[self.shared_key]

        if request_token and self.oauth_token != request_token:
            raise web.HTTPBadRequest(
                reason='Failed to obtain OAuth 1.0 access token. '
                       'Request token is invalid')

        data = await self.request('POST', self.access_token_url, params={
            'oauth_verifier': oauth_verifier, 'oauth_token': request_token}, loop=loop)

        self.oauth_token = data.get('oauth_token')
        self.oauth_token_secret = data.get('oauth_token_secret')

        return self.oauth_token, self.oauth_token_secret, data


class OAuth2Client(Client):
    """Implement OAuth2."""

    name = 'oauth2'
    shared_key = 'code'

    def __init__(self, client_id, client_secret, base_url=None,
                 authorize_url=None,
                 access_token=None, access_token_url=None,
                 access_token_key=None, session=None, logger=None,
                 **params):
        """Initialize the client."""
        super().__init__(base_url, authorize_url, access_token_key,
                         access_token_url, session, logger)

        self.access_token = access_token
        self.client_id = client_id
        self.client_secret = client_secret
        self.params = params

    def get_authorize_url(self, **params):
        """Return formatted authorize URL."""
        params = dict(self.params, **params)
        params.update({'client_id': self.client_id, 'response_type': 'code'})
        return self.authorize_url + '?' + urlencode(params)

    def request(self, method, url, params=None, headers=None, access_token=None, **aio_kwargs):
        """Request OAuth2 resource."""
        url = self._get_url(url)
        params = params or {}

        access_token = access_token or self.access_token
        if access_token:
            if isinstance(params, list):
                if self.access_token_key not in dict(params):
                    params.append((self.access_token_key, access_token))

            else:
                params[self.access_token_key] = access_token

        headers = headers or {
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        }
        return self._request(method, url, params=params, headers=headers, **aio_kwargs)

    async def get_access_token(self, code, loop=None, redirect_uri=None, **payload):
        """Get an access_token from OAuth provider.

        :returns: (access_token, provider_data)
        """
        # Possibility to provide REQUEST DATA to the method
        payload.setdefault('grant_type', 'authorization_code')
        payload.update({'client_id': self.client_id, 'client_secret': self.client_secret})

        if not isinstance(code, str) and self.shared_key in code:
            code = code[self.shared_key]
        payload['refresh_token' if payload['grant_type'] == 'refresh_token' else 'code'] = code

        redirect_uri = redirect_uri or self.params.get('redirect_uri')
        if redirect_uri:
            payload['redirect_uri'] = redirect_uri

        self.access_token = None
        data = await self.request('POST', self.access_token_url, data=payload, loop=loop)

        try:
            self.access_token = data['access_token']

        except KeyError:
            self.logger.error(
                'Error when getting the access token.\nData returned by OAuth server: %r',
                data,
            )
            raise web.HTTPBadRequest(reason='Failed to obtain OAuth access token.')

        return self.access_token, data


class Bitbucket2Client(OAuth2Client):
    """Support Bitbucket API 2.0.

    * Dashboard: https://bitbucket.org/account/user/peterhudec/api
    * Docs:https://confluence.atlassian.com/display/BITBUCKET/OAuth+on+Bitbucket+Cloud
    * API refer: https://confluence.atlassian.com/display/BITBUCKET/Using+the+Bitbucket+REST+APIs
    """

    access_token_url = 'https://bitbucket.org/site/oauth2/access_token'
    authorize_url = 'https://bitbucket.org/site/oauth2/authorize'
    base_url = 'https://api.bitbucket.org/2.0/'
    name = 'bitbucket'
    user_info_url = 'https://api.bitbucket.org/2.0/user'

    @staticmethod
    def user_parse(data):
        """Parse information from the provider."""
        yield 'id', data.get('uuid')
        yield 'username', data.get('username')
        yield 'last_name', data.get('display_name')
        links = data.get('links', {})
        yield 'picture', links.get('avatar', {}).get('href')
        yield 'link', links.get('html', {}).get('href')

    def _request(self, method, url, headers=None, params=None, **aio_kwargs):
        """Setup Authorization Header.."""
        auth = None
        access_token = params.pop(self.access_token_key, self.access_token)
        headers = headers or {}
        if access_token:
            headers['Authorization'] = "Bearer %s" % access_token
        else:
            auth = BasicAuth(self.client_id, self.client_secret)

        return super(Bitbucket2Client, self)._request(
            method, url, headers=headers, params=params, auth=auth, **aio_kwargs)


class DiscordClient(OAuth2Client):
    """Support Discord API

    * Dashboard: https://discordapp.com/developers/applications/me
    * Docs: https://discordapp.com/developers/docs/topics/oauth2
    * API refer: https://discordapp.com/developers/docs/reference
    """

    access_token_url = 'https://discordapp.com/api/oauth2/token'
    authorize_url = 'https://discordapp.com/api/oauth2/authorize'
    base_url = 'https://discordapp.com/api/v6/'
    name = 'discord'
    user_info_url = 'https://discordapp.com/api/v6/users/@me'

    @staticmethod
    def user_parse(data):
        """Parse information from the provider."""
        yield 'id', data.get('id')
        yield 'username', data.get('username')
        yield 'discriminator', data.get('discriminator')
        yield 'picture', "https://cdn.discordapp.com/avatars/{}/{}.png".format(
            data.get('id'), data.get('avatar'))

    def _request(self, method, url, headers=None, params=None, **aio_kwargs):
        """Setup Authorization Header.."""
        access_token = params.pop(self.access_token_key, None)
        if access_token:
            headers['Authorization'] = "Bearer %s" % access_token
        return super(DiscordClient, self)._request(
            method, url, headers=headers, params=params, **aio_kwargs)


class Flickr(OAuth1Client):
    """Support Flickr.

    * Dashboard: https://www.flickr.com/services/apps/
    * Docs: https://www.flickr.com/services/api/auth.oauth.html
    * API reference: https://www.flickr.com/services/api/
    """

    access_token_url = 'http://www.flickr.com/services/oauth/request_token'
    authorize_url = 'http://www.flickr.com/services/oauth/authorize'
    base_url = 'https://api.flickr.com/'
    name = 'flickr'
    request_token_url = 'http://www.flickr.com/services/oauth/request_token'
    user_info_url = 'http://api.flickr.com/services/rest?' \
                    'method=flickr.test.login&format=json&nojsoncallback=1'  # noqa

    @staticmethod
    def user_parse(data):
        """Parse information from the provider."""
        user_ = data.get('user', {})
        yield 'id', data.get('user_nsid') or user_.get('id')
        yield 'username', user_.get('username', {}).get('_content')
        first_name, _, last_name = data.get(
            'fullname', {}).get('_content', '').partition(' ')
        yield 'first_name', first_name
        yield 'last_name', last_name


class LichessClient(OAuth2Client):
    """Support Lichess.

    * Dashboard: https://lichess.org/account/oauth/app
    * Docs: https://lichess.org/api#section/Authentication
    * API reference: https://lichess.org/api
    """

    access_token_url = 'https://oauth.lichess.org/oauth'
    authorize_url = 'https://oauth.lichess.org/oauth/authorize'
    base_url = 'https://lichess.org/'
    name = 'lichess'
    user_info_url = 'https://lichess.org/api/account'

    @staticmethod
    def user_parse(data):
        """Parse information from provider."""
        yield 'id', data.get('id')
        yield 'username', data.get('username')
        profile = data.get('profile')
        if profile is not None:
            yield 'first_name', data.get('profile').get("firstName")
            yield 'last_name', data.get('profile').get("lastName")
            yield 'country', data.get('profile').get("country")

    def _request(self, method, url, headers=None, params=None, **aio_kwargs):
        """Setup Authorization Header.."""
        access_token = params.pop(self.access_token_key, None)
        if access_token:
            headers['Authorization'] = "Bearer %s" % access_token
        return super(LichessClient, self)._request(
            method, url, headers=headers, params=params, **aio_kwargs)


class Meetup(OAuth1Client):
    """Support Meetup.

    * Dashboard: http://www.meetup.com/meetup_api/oauth_consumers/
    * Docs: http://www.meetup.com/meetup_api/auth/#oauth
    * API: http://www.meetup.com/meetup_api/docs/
    """

    access_token_url = 'https://api.meetup.com/oauth/access/'
    authorize_url = 'http://www.meetup.com/authorize/'
    base_url = 'https://api.meetup.com/2/'
    name = 'meetup'
    request_token_url = 'https://api.meetup.com/oauth/request/'

    @staticmethod
    def user_parse(data):
        """Parse information from the provider."""
        yield 'id', data.get('id') or data.get('member_id')
        yield 'locale', data.get('lang')
        yield 'picture', data.get('photo', {}).get('photo_link')


class Plurk(OAuth1Client):
    """Support Plurk.

    * Dashboard: http://www.plurk.com/PlurkApp/
    * API: http://www.plurk.com/API
    * API explorer: http://www.plurk.com/OAuth/test/
    """

    access_token_url = 'http://www.plurk.com/OAuth/access_token'
    authorize_url = 'http://www.plurk.com/OAuth/authorize'
    base_url = 'http://www.plurk.com/APP/'
    name = 'plurk'
    request_token_url = 'http://www.plurk.com/OAuth/request_token'
    user_info_url = 'http://www.plurk.com/APP/Profile/getOwnProfile'

    @staticmethod
    def user_parse(data):
        """Parse information from the provider."""
        _user = data.get('user_info', {})
        _id = _user.get('id') or _user.get('uid')
        yield 'id', _id
        yield 'locale', _user.get('default_lang')
        yield 'username', _user.get('display_name')
        first_name, _, last_name = _user.get('full_name', '').partition(' ')
        yield 'first_name', first_name
        yield 'last_name', last_name
        yield 'picture', 'http://avatars.plurk.com/{0}-big2.jpg'.format(_id)
        city, country = map(lambda s: s.strip(),
                            _user.get('location', ',').split(','))
        yield 'city', city
        yield 'country', country


class TwitterClient(OAuth1Client):
    """Support Twitter.

    * Dashboard: https://dev.twitter.com/apps
    * Docs: https://dev.twitter.com/docs
    * API reference: https://dev.twitter.com/docs/api
    """

    access_token_url = 'https://api.twitter.com/oauth/access_token'
    authorize_url = 'https://api.twitter.com/oauth/authorize'
    base_url = 'https://api.twitter.com/1.1/'
    name = 'twitter'
    request_token_url = 'https://api.twitter.com/oauth/request_token'
    user_info_url = 'https://api.twitter.com/1.1/account/' \
                    'verify_credentials.json'

    @staticmethod
    def user_parse(data):
        """Parse information from the provider."""
        yield 'id', data.get('id') or data.get('user_id')
        first_name, _, last_name = data['name'].partition(' ')
        yield 'first_name', first_name
        yield 'last_name', last_name
        yield 'email', data.get('email')
        yield 'picture', data.get('profile_image_url')
        yield 'locale', data.get('lang')
        yield 'link', data.get('url')
        yield 'username', data.get('screen_name')
        city, _, country = map(lambda s: s.strip(),
                               data.get('location', '').partition(','))
        yield 'city', city
        yield 'country', country


class TumblrClient(OAuth1Client):
    """Support Tumblr.

    * Dashboard: http://www.tumblr.com/oauth/apps
    * Docs: http://www.tumblr.com/docs/en/api/v2#auth
    * API reference: http://www.tumblr.com/docs/en/api/v2
    """

    access_token_url = 'http://www.tumblr.com/oauth/access_token'
    authorize_url = 'http://www.tumblr.com/oauth/authorize'
    base_url = 'https://api.tumblr.com/v2/'
    name = 'tumblr'
    request_token_url = 'http://www.tumblr.com/oauth/request_token'
    user_info_url = 'http://api.tumblr.com/v2/user/info'

    @staticmethod
    def user_parse(data):
        """Parse information from the provider."""
        _user = data.get('response', {}).get('user', {})
        yield 'id', _user.get('name')
        yield 'username', _user.get('name')
        yield 'link', _user.get('blogs', [{}])[0].get('url')


class VimeoClient(OAuth1Client):
    """Support Vimeo."""

    access_token_url = 'https://vimeo.com/oauth/access_token'
    authorize_url = 'https://vimeo.com/oauth/authorize'
    base_url = 'https://vimeo.com/api/rest/v2/'
    name = 'vimeo'
    request_token_url = 'https://vimeo.com/oauth/request_token'
    user_info_url = 'http://vimeo.com/api/rest/v2?' \
                    'format=json&method=vimeo.oauth.checkAccessToken'

    @staticmethod
    def user_parse(data):
        """Parse information from the provider."""
        _user = data.get('oauth', {}).get('user', {})
        yield 'id', _user.get('id')
        yield 'username', _user.get('username')
        first_name, _, last_name = _user.get('display_name').partition(' ')
        yield 'first_name', first_name
        yield 'last_name', last_name


class YahooClient(OAuth1Client):
    """Support Yahoo.

    * Dashboard: https://developer.vimeo.com/apps
    * Docs: https://developer.vimeo.com/apis/advanced#oauth-endpoints
    * API reference: https://developer.vimeo.com/apis
    """

    access_token_url = 'https://api.login.yahoo.com/oauth/v2/get_token'
    authorize_url = 'https://api.login.yahoo.com/oauth/v2/request_auth'
    base_url = 'https://query.yahooapis.com/v1/'
    name = 'yahoo'
    request_token_url = 'https://api.login.yahoo.com/oauth/v2/get_request_token'
    user_info_url = ('https://query.yahooapis.com/v1/yql?q=select%20*%20from%20'
                     'social.profile%20where%20guid%3Dme%3B&format=json')

    @staticmethod
    def user_parse(data):
        """Parse information from the provider."""
        _user = data.get('query', {}).get('results', {}).get('profile', {})
        yield 'id', _user.get('guid')
        yield 'username', _user.get('username')
        yield 'link', _user.get('profileUrl')
        emails = _user.get('emails')
        if isinstance(emails, list):
            for email in emails:
                if 'primary' in list(email.keys()):
                    yield 'email', email.get('handle')
        elif isinstance(emails, dict):
            yield 'email', emails.get('handle')
        yield 'picture', _user.get('image', {}).get('imageUrl')
        city, country = map(lambda s: s.strip(),
                            _user.get('location', ',').split(','))
        yield 'city', city
        yield 'country', country


class AmazonClient(OAuth2Client):
    """Support Amazon.

    * Dashboard: https://developer.amazon.com/lwa/sp/overview.html
    * Docs: https://developer.amazon.com/public/apis/engage/login-with-amazon/docs/conceptual_overview.html # noqa
    * API reference: https://developer.amazon.com/public/apis
    """

    access_token_url = 'https://api.amazon.com/auth/o2/token'
    authorize_url = 'https://www.amazon.com/ap/oa'
    base_url = 'https://api.amazon.com/'
    name = 'amazon'
    user_info_url = 'https://api.amazon.com/user/profile'

    @staticmethod
    def user_parse(data):
        """Parse information from provider."""
        yield 'id', data.get('user_id')


class EventbriteClient(OAuth2Client):
    """Support Eventbrite.

    * Dashboard: http://www.eventbrite.com/myaccount/apps/
    * Docs: https://developer.eventbrite.com/docs/auth/
    * API: http://developer.eventbrite.com/docs/
    """

    access_token_url = 'https://www.eventbrite.com/oauth/token'
    authorize_url = 'https://www.eventbrite.com/oauth/authorize'
    base_url = 'https://www.eventbriteapi.com/v3/'
    name = 'eventbrite'
    user_info_url = 'https://www.eventbriteapi.com/v3/users/me'

    @staticmethod
    def user_parse(data):
        """Parse information from provider."""
        for email in data.get('emails', []):
            if email.get('primary'):
                yield 'id', email.get('email')
                yield 'email', email.get('email')
                break


class FacebookClient(OAuth2Client):
    """Support Facebook.

    * Dashboard: https://developers.facebook.com/apps
    * Docs: http://developers.facebook.com/docs/howtos/login/server-side-login/
    * API reference: http://developers.facebook.com/docs/reference/api/
    * API explorer: http://developers.facebook.com/tools/explorer
    """

    access_token_url = 'https://graph.facebook.com/oauth/access_token'
    authorize_url = 'https://www.facebook.com/dialog/oauth'
    base_url = 'https://graph.facebook.com/v2.4'
    name = 'facebook'
    user_info_url = 'https://graph.facebook.com/me'

    async def user_info(self, params=None, **kwargs):
        """Facebook required fields-param."""
        params = params or {}
        params[
            'fields'] = 'id,email,first_name,last_name,name,link,locale,' \
                        'gender,location'
        return await super(FacebookClient, self).user_info(params=params, **kwargs)

    @staticmethod
    def user_parse(data):
        """Parse information from provider."""
        id_ = data.get('id')
        yield 'id', id_
        yield 'email', data.get('email')
        yield 'first_name', data.get('first_name')
        yield 'last_name', data.get('last_name')
        yield 'username', data.get('name')
        yield 'picture', 'http://graph.facebook.com/{0}/picture?' \
                         'type=large'.format(id_)
        yield 'link', data.get('link')
        yield 'locale', data.get('locale')
        yield 'gender', data.get('gender')

        location = data.get('location', {}).get('name')
        if location:
            split_location = location.split(', ')
            yield 'city', split_location[0].strip()
            if len(split_location) > 1:
                yield 'country', split_location[1].strip()


class FoursquareClient(OAuth2Client):
    """Support Foursquare.

    * Dashboard: https://foursquare.com/developers/apps
    * Docs: https://developer.foursquare.com/overview/auth.html
    * API reference: https://developer.foursquare.com/docs/
    """

    access_token_url = 'https://foursquare.com/oauth2/access_token'
    authorize_url = 'https://foursquare.com/oauth2/authenticate'
    base_url = 'https://api.foursquare.com/v2/'
    name = 'foursquare'
    user_info_url = 'https://api.foursquare.com/v2/users/self'

    @staticmethod
    def user_parse(data):
        """Parse information from the provider."""
        user = data.get('response', {}).get('user', {})
        yield 'id', user.get('id')
        yield 'email', user.get('contact', {}).get('email')
        yield 'first_name', user.get('firstName')
        yield 'last_name', user.get('lastName')
        city, country = user.get('homeCity', ', ').split(', ')
        yield 'city', city
        yield 'country', country


class GithubClient(OAuth2Client):
    """Support Github.

    * Dashboard: https://github.com/settings/applications/
    * Docs: http://developer.github.com/v3/#authentication
    * API reference: http://developer.github.com/v3/
    """

    access_token_url = 'https://github.com/login/oauth/access_token'
    authorize_url = 'https://github.com/login/oauth/authorize'
    base_url = 'https://api.github.com'
    name = 'github'
    user_info_url = 'https://api.github.com/user'

    @staticmethod
    def user_parse(data):
        """Parse information from provider."""
        yield 'id', data.get('id')
        yield 'email', data.get('email')
        first_name, _, last_name = (data.get('name') or '').partition(' ')
        yield 'first_name', first_name
        yield 'last_name', last_name
        yield 'username', data.get('login')
        yield 'picture', data.get('avatar_url')
        yield 'link', data.get('html_url')
        location = data.get('location', '')
        if location:
            split_location = location.split(',')
            yield 'country', split_location[0].strip()
            if len(split_location) > 1:
                yield 'city', split_location[1].strip()


class GoogleClient(OAuth2Client):
    """Support Google.

    * Dashboard: https://console.developers.google.com/project
    * Docs: https://developers.google.com/accounts/docs/OAuth2
    * API reference: https://developers.google.com/gdata/docs/directory
    * API explorer: https://developers.google.com/oauthplayground/
    """

    authorize_url = 'https://accounts.google.com/o/oauth2/v2/auth'
    access_token_url = 'https://www.googleapis.com/oauth2/v4/token'
    base_url = 'https://www.googleapis.com/userinfo/v2/'
    name = 'google'
    user_info_url = 'https://www.googleapis.com/userinfo/v2/me'

    @staticmethod
    def user_parse(data):
        """Parse information from provider."""
        yield 'id', data.get('id')
        yield 'email', data.get('email')
        yield 'first_name', data.get('given_name')
        yield 'last_name', data.get('family_name')
        yield 'link', data.get('link')
        yield 'locale', data.get('locale')
        yield 'picture', data.get('picture')
        yield 'gender', data.get('gender')


class VKClient(OAuth2Client):
    """Support vk.com.

    * Dashboard: http://vk.com/editapp?id={consumer_key}
    * Docs: http://vk.com/developers.php?oid=-17680044&p=Authorizing_Sites
    * API reference: http://vk.com/developers.php?oid=-17680044&p=API_Method_Description
    """

    authorize_url = 'http://api.vk.com/oauth/authorize'
    access_token_url = 'https://api.vk.com/oauth/access_token'
    user_info_url = 'https://api.vk.com/method/getProfiles?' \
                    'fields=uid,first_name,last_name,nickname,sex,bdate,city,' \
                    'country,timezone,photo_big'  # noqa
    name = 'vk'
    base_url = 'https://api.vk.com'

    def __init__(self, version='5.9.2', *args, **kwargs):
        """Set default scope."""
        super(VKClient, self).__init__(*args, **kwargs)
        self.user_info_url = "{0}&v={1}".format(self.user_info_url, version)
        self.params.setdefault('scope', 'offline')

    @staticmethod
    def user_parse(data):
        """Parse information from provider."""
        resp = data.get('response', [{}])[0]
        yield 'id', resp.get('id')
        yield 'first_name', resp.get('first_name')
        yield 'last_name', resp.get('last_name')
        yield 'username', resp.get('nickname')
        yield 'city', resp.get('city')
        yield 'country', resp.get('country')
        yield 'picture', resp.get('photo_big')


class OdnoklassnikiClient(OAuth2Client):
    """Support ok.ru.

    * Dashboard: http://ok.ru/dk?st.cmd=appsInfoMyDevList
    * Docs: https://apiok.ru/wiki/display/api/Authorization+OAuth+2.0
    * API reference: https://apiok.ru/wiki/pages/viewpage.action?pageId=49381398
    """

    authorize_url = 'https://connect.ok.ru/oauth/authorize'
    access_token_url = 'https://api.odnoklassniki.ru/oauth/token.do'
    user_info_url = 'http://api.ok.ru/api/users/getCurrentUser?' \
                    'fields=uid,first_name,last_name,gender,city,' \
                    'country,pic128max'  # noqa
    name = 'odnoklassniki'
    base_url = 'https://api.ok.ru'

    def __init__(self, *args, **kwargs):
        """Set default scope."""
        super().__init__(*args, **kwargs)
        self.params.setdefault('scope', 'offline')

    @staticmethod
    def user_parse(data):
        """Parse information from provider."""
        resp = data.get('response', [{}])[0]
        yield 'id', resp.get('uid')
        yield 'first_name', resp.get('first_name')
        yield 'last_name', resp.get('last_name')
        location = resp.get('location', {})
        yield 'city', location.get('city')
        yield 'country', location.get('country')
        yield 'picture', resp.get('pic128max')


class YandexClient(OAuth2Client):
    """Support Yandex.

    * Dashboard: https://oauth.yandex.com/client/my
    * Docs: http://api.yandex.com/oauth/doc/dg/reference/obtain-access-token.xml
    """

    access_token_url = 'https://oauth.yandex.com/token'
    access_token_key = 'oauth_token'
    authorize_url = 'https://oauth.yandex.com/authorize'
    base_url = 'https://login.yandex.ru/info'
    name = 'yandex'
    user_info_url = 'https://login.yandex.ru/info'

    @staticmethod
    def user_parse(data):
        """Parse information from provider."""
        yield 'id', data.get('id')
        yield 'username', data.get('login')
        yield 'email', data.get('default_email')
        yield 'first_name', data.get('first_name')
        yield 'last_name', data.get('last_name')
        yield 'picture', 'https://avatars.yandex.net/get-yapic/%s/islands-200' % data.get(
            'default_avatar_id', 0)


class LinkedinClient(OAuth2Client):
    """Support linkedin.com.

    * Dashboard: https://www.linkedin.com/developer/apps
    * Docs: https://developer.linkedin.com/docs/oauth2
    * API reference: https://developer.linkedin.com/docs/rest-api
    """

    name = 'linkedin'
    access_token_key = 'oauth2_access_token'
    access_token_url = 'https://www.linkedin.com/oauth/v2/accessToken'
    authorize_url = 'https://www.linkedin.com/oauth/v2/authorization'
    user_info_url = (
        'https://api.linkedin.com/v1/people/~:('
        'id,email-address,first-name,last-name,formatted-name,picture-url,'
        'public-profile-url,location)?format=json'
    )

    @staticmethod
    def user_parse(data):
        """Parse user data."""
        yield 'id', data.get('id')
        yield 'email', data.get('emailAddress')
        yield 'first_name', data.get('firstName')
        yield 'last_name', data.get('lastName')
        yield 'username', data.get('formattedName')
        yield 'picture', data.get('pictureUrl')
        yield 'link', data.get('publicProfileUrl')
        yield 'country', data.get('location', {}).get('name')


class PinterestClient(OAuth2Client):
    """Support pinterest.com.

    * Dashboard: https://developers.pinterest.com/apps/
    * Docs: https://developers.pinterest.com/docs/api/overview/
    """

    name = 'pinterest'
    access_token_url = 'https://api.pinterest.com/v1/oauth/token'
    authorize_url = 'https://api.pinterest.com/oauth/'
    user_info_url = 'https://api.pinterest.com/v1/me/'

    @staticmethod
    def user_parse(data):
        """Parse user data."""
        data = data.get('data', {})
        yield 'id', data.get('id')
        yield 'first_name', data.get('first_name')
        yield 'last_name', data.get('last_name')
        yield 'link', data.get('url')


class InstagramClient(OAuth2Client):
    """Support Instagram

		* Dashboard: https://www.instagram.com/developer/clients/manage/
		* Docs: https://www.instagram.com/developer/
    """

    access_token_url = 'https://api.instagram.com/oauth/access_token'
    authorize_url = 'https://api.instagram.com/oauth/authorize'
    base_url = 'https://api.instagram.com/v1'
    name = 'instagram'
    user_info_url = 'https://api.instagram.com/v1/users/self'

    @staticmethod
    def user_parse(data):
        """Parse information from the provider."""
        user = data.get('data')
        yield 'id', user.get('id')
        yield 'username', user.get('username')
        yield 'picture', user.get('profile_picture')
        first_name, _, last_name = user.get('full_name', '').partition(' ')
        yield 'first_name', first_name
        yield 'last_name', last_name

# pylama:ignore=E501
