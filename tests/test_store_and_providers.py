import unittest
from pathlib import Path

from app.providers import ProviderResolver
from app.store import CatalogStore


class PiraterCoreTests(unittest.TestCase):
    def test_search_and_lookup(self):
        store = CatalogStore(Path('data/catalog.json'))
        results = store.search('inter')
        self.assertTrue(any(item['id'] == 'tt0816692' for item in results))
        self.assertEqual(store.by_id('tt1375666')['title'], 'Inception')

    def test_provider_fallback(self):
        resolver = ProviderResolver(provider_health={'alpha': False, 'beta': True})
        picked = resolver.resolve([
            {'provider': 'alpha', 'url': 'a', 'quality': []},
            {'provider': 'beta', 'url': 'b', 'quality': ['720p']},
        ])
        self.assertIsNotNone(picked)
        self.assertEqual(picked.provider, 'beta')
        self.assertEqual(picked.url, 'b')


if __name__ == '__main__':
    unittest.main()
