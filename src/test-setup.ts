import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

// 화면 테스트는 전체를 한꺼번에 돌리면 느려진다. findBy·waitFor의 기본 1초 제한으로는 모자라서 넉넉히 둔다.
// (실패하는 테스트가 오래 기다리는 손해는 있지만, 부하 때문에 멀쩡한 테스트가 떨어지는 것을 막는다.)
configure({ asyncUtilTimeout: 15_000 })

afterEach(cleanup)
