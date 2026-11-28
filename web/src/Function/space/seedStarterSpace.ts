import { createDomain, createObject, createElement } from '@/hooks/useSupabase';
import { addStrategyChild, createStrategy } from '@/hooks/strategyData';
import { createVision } from '@/hooks/visionData';
import type { Locale } from '@/Function/i18n/locales';
import { starterContent } from './starterContent';

/** Fills a just-created Space with its starter Domain, Vision and Portfolios. */
export async function seedStarterSpace(spaceId: string, userId: string, locale: Locale): Promise<void> {
  const content = starterContent(locale);

  const domain = await createDomain({
    name: content.domain.name,
    identifier: content.domain.identifier,
    description: content.domain.description,
    privacy: 'workspace',
    user_id: userId,
    activity_space_id: spaceId,
  });

  // In order, so Objects and Elements keep the order they are written in.
  const objectIds = new Map<string, string>();
  for (const [index, object] of content.objects.entries()) {
    const created = await createObject({
      name: object.name,
      description: object.description,
      domain_id: domain.id,
      order_index: index,
    });
    objectIds.set(object.key, created.id);
    for (const [elementIndex, element] of object.elements.entries()) {
      await createElement({
        title: element.title,
        description: element.description,
        object_id: created.id,
        order_index: elementIndex,
      });
    }
  }

  // The Vision first, so every Portfolio is written into it rather than into
  // a Vision the database makes up for the Space.
  const vision = await createVision(content.vision.name, content.vision.description, spaceId);
  for (const group of content.portfolios) {
    const parent = await createStrategy({ name: group.name, description: group.description, activity_space_id: spaceId, vision_id: vision.id }, []);
    for (const portfolio of group.children) {
      const child = await createStrategy(
        { name: portfolio.name, description: portfolio.description, activity_space_id: spaceId, vision_id: vision.id },
        portfolio.objectKeys.flatMap((key) => objectIds.get(key) ?? []),
      );
      await addStrategyChild(parent.id, child.id);
    }
  }
}
